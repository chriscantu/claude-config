#!/usr/bin/env bun
/**
 * Stream-json CLI eval runner.
 *
 * Spawns `claude --print --output-format stream-json`, parses the NDJSON event
 * stream, and runs assertions against *structured signals* (final text, tool
 * uses, skill invocations) instead of raw prose.
 *
 * Why this substrate (vs. v1 plain `claude --print`):
 *   - v1 only sees stdout text: regex-on-prose is brittle and can't tell a
 *     "Skill invoked" block from a model describing a skill in prose.
 *   - stream-json surfaces tool-use blocks directly from the CLI transport, so
 *     assertions can target structural facts ("did the Skill tool fire?")
 *     instead of the model's narration about what it did.
 *
 * Usage:
 *   bun run tests/eval-runner-v2.ts                      # all skills with evals
 *   bun run tests/eval-runner-v2.ts define-the-problem   # one skill
 *   bun run tests/eval-runner-v2.ts --dry-run            # validate JSON + skills only
 *   env CLAUDE_BIN=/path/to/claude bun run tests/eval-runner-v2.ts
 *
 * Transcripts land in tests/results/ with a `-v2` suffix so v1 and v2 runs can
 * coexist during side-by-side comparison.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type EvalFile,
  type EvalTally,
  type MetaDecision,
  type Signals,
  type ValidatedAssertion,
  aggregateChainSignals,
  discoverSkills,
  evaluate,
  evaluateChain,
  extractSessionId,
  extractSignals,
  loadEvalFile,
  metaCheck,
  parseStreamJson,
  suiteOk,
  tallyEval,
} from "./evals-lib.ts";

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(repoDir, "skills");
const resultsDir = join(repoDir, "tests", "results");
const claudeBin = process.env.CLAUDE_BIN ?? "claude";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skillFilter = args.find((a) => !a.startsWith("--"));

/**
 * `exitCode` is null when the process was killed by signal or never started
 * (spawn error). Keep it nullable instead of coercing to -1 so the transcript
 * can distinguish "exited cleanly with code N" from "no exit code available."
 */
interface CliRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly failure?: string;
}

interface ChainRun {
  readonly turns: readonly CliRun[];
  readonly sessionId: string | null;
  /** Set when the chain could not proceed — e.g. turn 1 failed or yielded no session_id. */
  readonly chainFailure?: string;
}

const TURN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * MCP config for the named-cost-skip-ack server.
 * Passed via --mcp-config so the tool is available as a deferred tool in
 * --print sessions (stdio MCP servers require explicit config in batch mode).
 */
const NAMED_COST_SKIP_MCP_CONFIG = JSON.stringify({
  mcpServers: {
    "named-cost-skip-ack": {
      type: "stdio",
      command: "bun",
      args: [join(repoDir, "mcp-servers", "named-cost-skip-ack.ts")],
    },
  },
});

const CLI_BASE_ARGS = ["--print", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions", "--mcp-config", NAMED_COST_SKIP_MCP_CONFIG] as const;

/**
 * Spawn `claude` with the given args, classify the exit reason, and return a
 * normalized CliRun. Shared by the single-turn path and every turn of a chain
 * so spawn-failure classification lives in exactly one place.
 */
function spawnClaudeCli(args: readonly string[], prompt: string, cwd: string): CliRun {
  const res = spawnSync(claudeBin, [...args], {
    input: prompt,
    encoding: "utf8",
    timeout: TURN_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    cwd,
  });
  let failure: string | undefined;
  if (res.error) {
    failure = `spawn error: ${(res.error as NodeJS.ErrnoException).code ?? ""} ${res.error.message}`.trim();
  } else if (res.signal) {
    failure = res.signal === "SIGTERM" ? `timed out after ${TURN_TIMEOUT_MS / 1000}s (SIGTERM)` : `killed by signal ${res.signal}`;
  } else if (res.status === null) {
    failure = "process exited without status (no signal, no error)";
  }
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", exitCode: res.status, failure };
}

/**
 * Spawn a single fresh `claude --print` turn in an isolated scratch cwd.
 * Used for single-turn evals and as turn 1 of a multi-turn chain.
 *
 * When `cwd` is provided (by the chain helper), the caller owns cleanup.
 * Otherwise we create and clean up a tmpdir in this function.
 */
function runClaude(prompt: string, cwd?: string): CliRun {
  const ownCwd = cwd ?? mkdtempSync(join(tmpdir(), "claude-eval-"));
  try {
    return spawnClaudeCli(CLI_BASE_ARGS, prompt, ownCwd);
  } finally {
    if (!cwd) {
      try {
        rmSync(ownCwd, { recursive: true, force: true });
      } catch (err) {
        console.error(`[eval-runner] failed to clean scratch dir ${ownCwd}: ${(err as Error).message}`);
      }
    }
  }
}

/**
 * Run an N-turn chain via `claude --print` (turn 1) + `claude --resume <id>`
 * (turns 2..N). All turns share one scratch cwd so tool writes persist.
 *
 * Short-circuits if turn 1 fails to produce a session_id — chain continuation
 * would be meaningless without a valid --resume handle. Partial-failure runs
 * return a `chainFailure` message; the caller decides how to render it.
 *
 * Each turn has its own 5-minute timeout; a 3-turn chain therefore caps at 15
 * minutes of wall time.
 */
function runClaudeChain(turnPrompts: readonly string[]): ChainRun {
  if (turnPrompts.length === 0) {
    return { turns: [], sessionId: null, chainFailure: "chain has zero turns" };
  }
  const scratchDir = mkdtempSync(join(tmpdir(), "claude-eval-chain-"));
  const runs: CliRun[] = [];
  let sessionId: string | null = null;
  let chainFailure: string | undefined;
  try {
    // Turn 1: fresh session
    const t1 = runClaude(turnPrompts[0], scratchDir);
    runs.push(t1);
    if (t1.failure || t1.exitCode !== 0) {
      chainFailure = `turn 1 failed: ${t1.failure ?? `exit ${t1.exitCode}`}`;
      return { turns: runs, sessionId: null, chainFailure };
    }
    const { events: t1Events } = parseStreamJson(t1.stdout);
    sessionId = extractSessionId(t1Events);
    if (!sessionId) {
      chainFailure = `turn 1 produced no session_id in stream-json init event (events=${t1Events.length})`;
      return { turns: runs, sessionId: null, chainFailure };
    }

    // Turns 2..N: resume
    for (let i = 1; i < turnPrompts.length; i++) {
      const turnRun = spawnClaudeCli(
        ["--resume", sessionId, ...CLI_BASE_ARGS],
        turnPrompts[i],
        scratchDir,
      );
      runs.push(turnRun);
      if (turnRun.failure || turnRun.exitCode !== 0) {
        chainFailure = `turn ${i + 1} failed: ${turnRun.failure ?? `exit ${turnRun.exitCode}`}`;
        // Stop the chain — turn N+1 depends on N succeeding. Assertions for
        // later turns will be counted as failures by the caller.
        return { turns: runs, sessionId, chainFailure };
      }
      // Symmetric with the single-turn empty-events gate: a clean exit with
      // zero parseable events means the CLI returned without the structured
      // stream we need. Continuing would burn wall-time on a session that
      // can't answer anything. Abort the chain here rather than quietly
      // tolerating degenerate middle turns.
      const { events } = parseStreamJson(turnRun.stdout);
      if (events.length === 0) {
        chainFailure = `turn ${i + 1} produced no parseable stream-json events (stdout=${turnRun.stdout.length}B)`;
        return { turns: runs, sessionId, chainFailure };
      }
    }

    return { turns: runs, sessionId };
  } finally {
    try {
      rmSync(scratchDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`[eval-runner] failed to clean scratch dir ${scratchDir}: ${(err as Error).message}`);
    }
  }
}

function colour(s: string, code: string): string {
  return process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
}
const green = (s: string) => colour(s, "32");
const red = (s: string) => colour(s, "31");
const dim = (s: string) => colour(s, "2");
const bold = (s: string) => colour(s, "1");

function renderDecisions(decisions: readonly MetaDecision[], turnLabel: string | null): void {
  for (const d of decisions) {
    const prefix = turnLabel ? `${turnLabel}: ` : "";
    const tierSuffix = d.tier === "diagnostic" ? dim(" [diagnostic]") : "";
    if (d.kind === "pass") {
      console.log(`    ${green("✓")} ${prefix}${d.description}${tierSuffix}`);
    } else if (d.kind === "silent_fire") {
      console.log(`    ${red("SILENT-FIRE FAILURE")} ${prefix}${d.description}${tierSuffix}`);
      console.log(`        ${dim(d.detail)}`);
    } else {
      console.log(`    ${red("✗")} ${prefix}${d.description}${tierSuffix}`);
      console.log(`        ${dim(d.detail)}`);
    }
  }
}

interface TranscriptArgs {
  readonly path: string;
  readonly skillName: string;
  readonly evalName: string;
  readonly prompt: string;
  readonly signals: Signals | null;
  readonly rawStdout: string;
  readonly rawStderr: string;
  readonly exitCode: number | null;
  readonly parsedEvents?: number;
  readonly skippedLines?: number;
  readonly failure?: string;
  readonly decisions?: readonly MetaDecision[];
  /** The eval's assertions, used to render an "Assertions (not evaluated)"
   *  stub when the run failed before metaCheck could produce decisions.
   *  Keeps transcript shape consistent between pass and fail cases. */
  readonly unevaluatedAssertions?: readonly ValidatedAssertion[];
}

/**
 * Render the Assertions section with the same structure in pass and fail
 * transcripts. A run that fails before assertions are evaluated still emits
 * a section — labeled "not evaluated" — listing each assertion so a reader
 * doesn't have to infer from silence why there's no decision list.
 */
function renderAssertionsSection(
  body: string[],
  decisions?: readonly MetaDecision[],
  unevaluated?: readonly ValidatedAssertion[],
  notEvaluatedReason?: string,
): void {
  if (decisions && decisions.length > 0) {
    const required = decisions.filter((d) => d.tier === "required");
    const diagnostic = decisions.filter((d) => d.tier === "diagnostic");
    body.push("", "## Assertions (required)", "");
    for (const d of required) body.push(`- [${d.kind}] ${d.description}${d.kind !== "pass" ? ` — ${("detail" in d ? d.detail : "")}` : ""}`);
    if (diagnostic.length > 0) {
      body.push("", "## Assertions (diagnostic)", "");
      for (const d of diagnostic) body.push(`- [${d.kind}] ${d.description}${d.kind !== "pass" ? ` — ${("detail" in d ? d.detail : "")}` : ""}`);
    }
    return;
  }
  if (unevaluated && unevaluated.length > 0) {
    body.push("", "## Assertions (not evaluated)", "");
    const reason = notEvaluatedReason ?? "run failed before assertions were evaluated";
    body.push(`_Reason: ${reason}_`, "");
    const required = unevaluated.filter((a) => a.tier === "required");
    const diagnostic = unevaluated.filter((a) => a.tier === "diagnostic");
    if (required.length > 0) {
      body.push("**Required:**");
      for (const a of required) body.push(`- [not_evaluated] ${a.description}`);
    }
    if (diagnostic.length > 0) {
      body.push("", "**Diagnostic:**");
      for (const a of diagnostic) body.push(`- [not_evaluated] ${a.description}`);
    }
  }
}

function writeTranscript(a: TranscriptArgs): void {
  const skillsSeen = a.signals?.skillInvocations.map((s) => s.skill) ?? [];
  const toolsSeen = a.signals?.toolUses.map((t) => t.name) ?? [];
  const meta = [
    `exit_code: ${a.exitCode ?? "(none — signal or spawn error)"}`,
    `stdout_bytes: ${a.rawStdout.length}`,
    `stderr_bytes: ${a.rawStderr.length}`,
    `parsed_events: ${a.parsedEvents ?? "(not parsed)"}`,
    `skipped_lines: ${a.skippedLines ?? "(not parsed)"}`,
    `terminal_state: ${a.signals?.terminalState ?? "(no signals)"}`,
    `tool_uses: ${toolsSeen.length === 0 ? "(none)" : toolsSeen.join(", ")}`,
    `skills_invoked: ${skillsSeen.length === 0 ? "(none)" : skillsSeen.join(", ")}`,
  ].join("\n");
  const body = [
    `# ${a.skillName} / ${a.evalName} (v2)`,
    "",
    "## Prompt",
    "",
    a.prompt,
    "",
    "## Final text",
    "",
    a.signals?.finalText ?? "(no signals — run failed)",
    "",
    "## Metadata",
    "",
    meta,
  ];
  if (a.failure) {
    body.push("", "## Failure", "", a.failure);
  }
  if (a.rawStderr.trim()) {
    body.push("", "## Stderr", "", a.rawStderr);
  }
  renderAssertionsSection(body, a.decisions, a.unevaluatedAssertions, a.failure);
  // Raw NDJSON last — it's the biggest blob and least-read, but essential for
  // post-mortem debugging when an assertion disagrees with what a human sees.
  body.push("", "## Raw stream-json stdout", "", "```", a.rawStdout || "(empty)", "```", "");
  try {
    writeFileSync(a.path, body.join("\n"));
  } catch (err) {
    console.error(`    [eval-runner] transcript write failed (${a.path}): ${(err as Error).message}`);
  }
}

interface ChainTranscriptArgs {
  readonly path: string;
  readonly skillName: string;
  readonly evalName: string;
  readonly turnPrompts: readonly string[];
  readonly turnSignals: ReadonlyArray<Signals | null>;
  readonly turnRuns: readonly CliRun[];
  readonly sessionId: string | null;
  readonly chainFailure?: string;
  readonly decisions?: readonly MetaDecision[];
  /** Full flat list of assertions (per-turn + final), used to render an
   *  "Assertions (not evaluated)" stub when the chain failed before
   *  metaCheck could produce decisions. */
  readonly unevaluatedAssertions?: readonly ValidatedAssertion[];
}

function writeChainTranscript(a: ChainTranscriptArgs): void {
  const body: string[] = [
    `# ${a.skillName} / ${a.evalName} (v2, multi-turn)`,
    "",
    `session_id: ${a.sessionId ?? "(none)"}`,
    `turns_run: ${a.turnRuns.length}/${a.turnPrompts.length}`,
  ];
  if (a.chainFailure) body.push(`chain_failure: ${a.chainFailure}`);
  body.push("");

  for (let i = 0; i < a.turnPrompts.length; i++) {
    const run = a.turnRuns[i];
    const signals = a.turnSignals[i] ?? null;
    body.push(`## Turn ${i + 1} prompt`, "", a.turnPrompts[i], "");
    if (!run) {
      body.push(`(turn not run — chain aborted before reaching it)`, "");
      continue;
    }
    body.push(`## Turn ${i + 1} final text`, "", signals?.finalText ?? "(no signals — turn failed)", "");
    const meta = [
      `exit_code: ${run.exitCode ?? "(none)"}`,
      `stdout_bytes: ${run.stdout.length}`,
      `stderr_bytes: ${run.stderr.length}`,
      `terminal_state: ${signals?.terminalState ?? "(no signals)"}`,
      `tool_uses: ${signals?.toolUses.map((t) => t.name).join(", ") || "(none)"}`,
      `skills_invoked: ${signals?.skillInvocations.map((s) => s.skill).join(", ") || "(none)"}`,
    ].join("\n");
    body.push(`## Turn ${i + 1} metadata`, "", meta, "");
    if (run.failure) body.push(`## Turn ${i + 1} failure`, "", run.failure, "");
    if (run.stderr.trim()) body.push(`## Turn ${i + 1} stderr`, "", run.stderr, "");
  }

  renderAssertionsSection(body, a.decisions, a.unevaluatedAssertions, a.chainFailure);
  body.push("");

  for (let i = 0; i < a.turnPrompts.length; i++) {
    const run = a.turnRuns[i];
    if (!run) continue;
    body.push(`## Turn ${i + 1} raw stream-json stdout`, "", "```", run.stdout || "(empty)", "```", "");
  }

  try {
    writeFileSync(a.path, body.join("\n"));
  } catch (err) {
    console.error(`    [eval-runner] transcript write failed (${a.path}): ${(err as Error).message}`);
  }
}

async function main() {
  const skills = skillFilter ? [skillFilter] : discoverSkills(skillsDir);
  if (skills.length === 0) {
    console.error("No skills with evals/evals.json found.");
    process.exit(1);
  }

  // Validate up-front — a bad JSON shouldn't waste CLI spawns on earlier skills.
  const loaded = new Map<string, EvalFile>();
  for (const skillName of skills) {
    try {
      const file = loadEvalFile(skillsDir, skillName);
      if (!file) {
        console.error(red(`✗ ${skillName}: no evals/evals.json`));
        process.exit(1);
      }
      loaded.set(skillName, file);
    } catch (err) {
      console.error(red(`✗ ${skillName}: ${(err as Error).message}`));
      process.exit(1);
    }
  }

  if (!dryRun) {
    const probe = spawnSync(claudeBin, ["--version"], { encoding: "utf8" });
    if (probe.status !== 0) {
      console.error(red(`Error: '${claudeBin}' not runnable. Set CLAUDE_BIN or use --dry-run.`));
      process.exit(1);
    }
  }

  mkdirSync(resultsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  let totalEvals = 0;
  let passedEvals = 0;
  let totalAssertions = 0;
  let passedAssertions = 0;
  // Per-eval tallies. `suiteOk(tallies)` decides the exit code per the
  // decision-doc contract: exit 0 iff every eval's required-tier gate passed
  // (silent_fire already implies requiredOk=false). Assertion counts drive the
  // human-readable "X/Y assertions passed" line but MUST NOT flip exit —
  // diagnostic-tier fails decrement the assertion count without being a gate.
  const tallies: EvalTally[] = [];

  // Shared helpers captured by the two branches below so the report counters
  // and transcript paths come from one place.

  function runSingleTurnEval(skillName: string, e: Extract<EvalFile["evals"][number], { kind: "single" }>): void {
    const transcriptFile = join(resultsDir, `${skillName}-${e.name}-v2-${timestamp}.md`);
    const { stdout, stderr, exitCode, failure } = runClaude(e.prompt);

    if (failure || exitCode !== 0) {
      totalAssertions += e.assertions.length;
      const reason = failure ?? `claude exited ${exitCode}: ${stderr.trim().split("\n")[0] ?? "(no stderr)"}`;
      console.log(`    ${red("✗")} ${reason}`);
      writeTranscript({
        path: transcriptFile,
        skillName,
        evalName: e.name,
        prompt: e.prompt,
        signals: null,
        rawStdout: stdout,
        rawStderr: stderr,
        exitCode,
        failure: reason,
        unevaluatedAssertions: e.assertions,
      });
      console.log(dim(`      transcript → ${transcriptFile.replace(repoDir + "/", "")}`));
      tallies.push({ evalPassed: false, assertionCount: e.assertions.length, passedAssertionCount: 0, silentFireCount: 0 });
      return;
    }

    const { events, skipped } = parseStreamJson(stdout);

    // Exit 0 with no parseable events means the CLI returned without emitting
    // the structured stream we rely on. Without this gate, every negative
    // assertion (not_contains / not_regex / not_skill_invoked) would trivially
    // pass against an empty signal set — a silent regression relative to v1.
    if (events.length === 0) {
      totalAssertions += e.assertions.length;
      const reason = `no parseable stream-json events (exit 0, stdout=${stdout.length}B, skipped=${skipped})`;
      console.log(`    ${red("✗")} ${reason}`);
      writeTranscript({
        path: transcriptFile,
        skillName,
        evalName: e.name,
        prompt: e.prompt,
        signals: null,
        rawStdout: stdout,
        rawStderr: stderr,
        exitCode,
        parsedEvents: 0,
        skippedLines: skipped,
        failure: reason,
        unevaluatedAssertions: e.assertions,
      });
      console.log(dim(`      transcript → ${transcriptFile.replace(repoDir + "/", "")}`));
      tallies.push({ evalPassed: false, assertionCount: e.assertions.length, passedAssertionCount: 0, silentFireCount: 0 });
      return;
    }

    const signals = extractSignals(events);

    const perTurn: Array<{ assertion: typeof e.assertions[number]; result: ReturnType<typeof evaluate>; signals: Signals | null; turnIndex: number }> = [];
    for (const a of e.assertions) {
      perTurn.push({ assertion: a, result: evaluate(a, signals), signals, turnIndex: 0 });
    }
    const meta = metaCheck({ perTurn, final: [] });
    const tally = tallyEval(meta, e.assertions.length);

    writeTranscript({
      path: transcriptFile,
      skillName,
      evalName: e.name,
      prompt: e.prompt,
      signals,
      rawStdout: stdout,
      rawStderr: stderr,
      exitCode,
      parsedEvents: events.length,
      skippedLines: skipped,
      decisions: meta.decisions,
    });

    renderDecisions(meta.decisions, /* turnLabel */ null);
    totalAssertions += tally.assertionCount;
    passedAssertions += tally.passedAssertionCount;
    if (tally.evalPassed) passedEvals++;
    if (tally.silentFireCount > 0) {
      console.log(red(`      ${tally.silentFireCount} SILENT-FIRE FAILURE(S) — required-tier negative assertions trivially passed against empty signals`));
    }
    tallies.push(tally);
    console.log(
      dim(
        `      transcript → ${transcriptFile.replace(repoDir + "/", "")}` +
          ` (events=${events.length} skipped=${skipped} tools=${signals.toolUses.length} skills=${signals.skillInvocations.length})`,
      ),
    );
  }

  function runMultiTurnEval(skillName: string, e: Extract<EvalFile["evals"][number], { kind: "multi" }>): void {
    const turns = e.turns;
    const turnPrompts = turns.map((t) => t.prompt);
    const transcriptFile = join(resultsDir, `${skillName}-${e.name}-v2-multiturn-${timestamp}.md`);
    const { turns: runs, sessionId, chainFailure } = runClaudeChain(turnPrompts);

    // Extract per-turn signals for each completed turn. Missing turns (chain
    // aborted before reaching them) get null signals; their assertions count
    // as failures. The first turn to fail has a CliRun entry but may have
    // unparseable stdout; the extractor gracefully returns terminalState:"empty".
    const turnSignals: (Signals | null)[] = [];
    for (const run of runs) {
      if (run.failure || run.exitCode !== 0) {
        turnSignals.push(null);
        continue;
      }
      const { events } = parseStreamJson(run.stdout);
      if (events.length === 0) {
        turnSignals.push(null);
        continue;
      }
      turnSignals.push(extractSignals(events));
    }
    while (turnSignals.length < turns.length) turnSignals.push(null);

    const allAssertions: ValidatedAssertion[] = [
      ...turns.flatMap((t) => t.assertions),
      ...(e.final_assertions ?? []),
    ];

    if (chainFailure) {
      writeChainTranscript({
        path: transcriptFile,
        skillName,
        evalName: e.name,
        turnPrompts,
        turnSignals,
        turnRuns: runs,
        sessionId,
        chainFailure,
        unevaluatedAssertions: allAssertions,
      });
      console.log(`    ${red("✗")} ${chainFailure}`);
      // All assertions still count — mark them failed so the summary is honest.
      totalAssertions += allAssertions.length;
      console.log(dim(`      transcript → ${transcriptFile.replace(repoDir + "/", "")}`));
      tallies.push({ evalPassed: false, assertionCount: allAssertions.length, passedAssertionCount: 0, silentFireCount: 0 });
      return;
    }

    const perTurn: Array<{ assertion: (typeof turns)[number]["assertions"][number]; result: ReturnType<typeof evaluate>; signals: Signals | null; turnIndex: number }> = [];
    for (let i = 0; i < turns.length; i++) {
      const signals = turnSignals[i];
      for (const a of turns[i].assertions) {
        const result = signals
          ? evaluate(a, signals)
          : { ok: false as const, description: a.description, detail: "no signals for this turn" };
        perTurn.push({ assertion: a, result, signals, turnIndex: i });
      }
    }

    const chain = aggregateChainSignals(
      turnSignals.map((s) => s ?? { finalText: "", toolUses: [], skillInvocations: [], terminalState: "empty" as const }),
    );
    const final = (e.final_assertions ?? []).map((a) => ({
      assertion: a,
      result: evaluateChain(a, chain),
    }));

    const meta = metaCheck({ perTurn, final });
    const tally = tallyEval(meta, allAssertions.length);

    writeChainTranscript({
      path: transcriptFile,
      skillName,
      evalName: e.name,
      turnPrompts,
      turnSignals,
      turnRuns: runs,
      sessionId,
      chainFailure,
      decisions: meta.decisions,
    });

    // Render per-turn and final decisions in their original order
    let decisionIdx = 0;
    for (let i = 0; i < turns.length; i++) {
      const n = turns[i].assertions.length;
      renderDecisions(meta.decisions.slice(decisionIdx, decisionIdx + n), `turn ${i + 1}`);
      decisionIdx += n;
    }
    if (final.length > 0) {
      renderDecisions(meta.decisions.slice(decisionIdx), "final");
    }

    totalAssertions += tally.assertionCount;
    passedAssertions += tally.passedAssertionCount;
    if (tally.evalPassed) passedEvals++;
    if (tally.silentFireCount > 0) {
      console.log(red(`      ${tally.silentFireCount} SILENT-FIRE FAILURE(S) — required-tier negative assertions trivially passed against empty signals`));
    }
    tallies.push(tally);
    const union = turnSignals.reduce((sum, s) => sum + (s?.skillInvocations.length ?? 0), 0);
    console.log(
      dim(
        `      transcript → ${transcriptFile.replace(repoDir + "/", "")}` +
          ` (turns=${runs.length}/${turns.length} skills=${union} session=${sessionId ?? "none"})`,
      ),
    );
  }

  console.log(dim(`v2 runner — stream-json CLI${dryRun ? " (dry-run)" : ""}\n`));

  for (const skillName of skills) {
    const evalFile = loaded.get(skillName)!;

    console.log(bold(`━━━ ${skillName} ━━━`));
    if (evalFile.description) console.log(dim(evalFile.description) + "\n");

    for (const e of evalFile.evals) {
      totalEvals++;
      console.log(`  ${bold("▸")} ${e.name}${e.summary ? dim(" — " + e.summary) : ""}`);

      if (dryRun) {
        const turns = e.kind === "multi" ? e.turns : [{ prompt: e.prompt, assertions: e.assertions }];
        for (const t of turns) {
          for (const a of t.assertions) {
            totalAssertions++;
            passedAssertions++;
            console.log(`    ${green("✓")} ${dim("[dry-run]")} ${a.description}`);
          }
        }
        if (e.kind === "multi") {
          for (const a of e.final_assertions ?? []) {
            totalAssertions++;
            passedAssertions++;
            console.log(`    ${green("✓")} ${dim("[dry-run, final]")} ${a.description}`);
          }
        }
        passedEvals++;
        continue;
      }

      if (e.kind === "multi") {
        runMultiTurnEval(skillName, e);
      } else {
        runSingleTurnEval(skillName, e);
      }
    }
    console.log("");
  }

  console.log("━".repeat(60));
  const evalLine = `${passedEvals}/${totalEvals} evals passed`;
  const assertionLine = `${passedAssertions}/${totalAssertions} assertions passed`;
  console.log(passedEvals === totalEvals ? green(evalLine) : red(evalLine));
  console.log(passedAssertions === totalAssertions ? green(assertionLine) : red(assertionLine));
  const totalSilentFires = tallies.reduce((n, t) => n + t.silentFireCount, 0);
  if (totalSilentFires > 0) {
    console.log(red(`${totalSilentFires} SILENT-FIRE FAILURE(S) across suite`));
  }

  // Exit-code contract (per decision doc): exit 0 iff every eval's
  // required-tier gate passed. Do NOT gate on passedAssertions — a diagnostic
  // fail would otherwise flip the exit, contradicting the tiered design.
  // Dry-run is special-cased: it mock-passes every assertion so the tallies
  // list is empty and `suiteOk` trivially holds, which is the intended
  // behavior (dry-run only validates JSON schema, not model output).
  const ok = dryRun || suiteOk(tallies);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
