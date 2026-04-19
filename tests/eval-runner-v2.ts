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
  type Signals,
  discoverSkills,
  evaluate,
  extractSessionId,
  extractSignals,
  loadEvalFile,
  parseStreamJson,
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

/**
 * Spawn a single fresh `claude --print` turn in an isolated scratch cwd.
 * Used for single-turn evals and as turn 1 of a multi-turn chain.
 *
 * When `cwd` is provided (by the chain helper), the caller owns cleanup.
 * Otherwise we create and clean up a tmpdir in this function.
 */
function runClaude(prompt: string, cwd?: string): CliRun {
  const timeoutMs = 5 * 60 * 1000;
  const ownCwd = cwd ?? mkdtempSync(join(tmpdir(), "claude-eval-"));
  try {
    const res = spawnSync(
      claudeBin,
      ["--print", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"],
      {
        input: prompt,
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        cwd: ownCwd,
      },
    );
    let failure: string | undefined;
    if (res.error) {
      failure = `spawn error: ${(res.error as NodeJS.ErrnoException).code ?? ""} ${res.error.message}`.trim();
    } else if (res.signal) {
      failure = res.signal === "SIGTERM" ? `timed out after ${timeoutMs / 1000}s (SIGTERM)` : `killed by signal ${res.signal}`;
    } else if (res.status === null) {
      failure = "process exited without status (no signal, no error)";
    }
    return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", exitCode: res.status, failure };
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
      const timeoutMs = 5 * 60 * 1000;
      const res = spawnSync(
        claudeBin,
        [
          "--resume", sessionId,
          "--print",
          "--output-format", "stream-json",
          "--verbose",
          "--permission-mode", "bypassPermissions",
        ],
        {
          input: turnPrompts[i],
          encoding: "utf8",
          timeout: timeoutMs,
          maxBuffer: 64 * 1024 * 1024,
          cwd: scratchDir,
        },
      );
      let failure: string | undefined;
      if (res.error) {
        failure = `spawn error: ${(res.error as NodeJS.ErrnoException).code ?? ""} ${res.error.message}`.trim();
      } else if (res.signal) {
        failure = res.signal === "SIGTERM" ? `timed out after ${timeoutMs / 1000}s (SIGTERM)` : `killed by signal ${res.signal}`;
      } else if (res.status === null) {
        failure = "process exited without status (no signal, no error)";
      }
      const turnRun: CliRun = { stdout: res.stdout ?? "", stderr: res.stderr ?? "", exitCode: res.status, failure };
      runs.push(turnRun);
      if (failure || res.status !== 0) {
        chainFailure = `turn ${i + 1} failed: ${failure ?? `exit ${res.status}`}`;
        // Stop the chain — turn N+1 depends on N succeeding. Assertions for
        // later turns will be counted as failures by the caller.
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
  // Raw NDJSON last — it's the biggest blob and least-read, but essential for
  // post-mortem debugging when an assertion disagrees with what a human sees.
  body.push("", "## Raw stream-json stdout", "", "```", a.rawStdout || "(empty)", "```", "");
  try {
    writeFileSync(a.path, body.join("\n"));
  } catch (err) {
    console.log(`    ${dim(`(transcript write failed: ${(err as Error).message})`)}`);
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

  console.log(dim(`v2 runner — stream-json CLI${dryRun ? " (dry-run)" : ""}\n`));

  for (const skillName of skills) {
    const evalFile = loaded.get(skillName)!;

    console.log(bold(`━━━ ${skillName} ━━━`));
    if (evalFile.description) console.log(dim(evalFile.description) + "\n");

    for (const e of evalFile.evals) {
      totalEvals++;
      console.log(`  ${bold("▸")} ${e.name}${e.summary ? dim(" — " + e.summary) : ""}`);

      // v2 runner only handles single-turn evals. Multi-turn evals (turns[]) are
      // handled by the multi-turn runner (Task 8). Skip them here.
      if (!e.prompt || !e.assertions) continue;

      if (dryRun) {
        for (const a of e.assertions) {
          totalAssertions++;
          passedAssertions++;
          console.log(`    ${green("✓")} ${dim("[dry-run]")} ${a.description}`);
        }
        passedEvals++;
        continue;
      }

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
        });
        console.log(dim(`      transcript → ${transcriptFile.replace(repoDir + "/", "")}`));
        continue;
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
        });
        console.log(dim(`      transcript → ${transcriptFile.replace(repoDir + "/", "")}`));
        continue;
      }

      const signals = extractSignals(events);
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
      });

      let evalPassed = true;
      for (const a of e.assertions) {
        totalAssertions++;
        const r = evaluate(a, signals);
        if (r.ok) {
          passedAssertions++;
          console.log(`    ${green("✓")} ${r.description}`);
        } else {
          evalPassed = false;
          console.log(`    ${red("✗")} ${r.description}`);
          console.log(`        ${dim(r.detail)}`);
        }
      }
      if (evalPassed) passedEvals++;
      console.log(
        dim(
          `      transcript → ${transcriptFile.replace(repoDir + "/", "")}` +
            ` (events=${events.length} skipped=${skipped} tools=${signals.toolUses.length} skills=${signals.skillInvocations.length})`,
        ),
      );
    }
    console.log("");
  }

  console.log("━".repeat(60));
  const evalLine = `${passedEvals}/${totalEvals} evals passed`;
  const assertionLine = `${passedAssertions}/${totalAssertions} assertions passed`;
  console.log(passedEvals === totalEvals ? green(evalLine) : red(evalLine));
  console.log(passedAssertions === totalAssertions ? green(assertionLine) : red(assertionLine));

  const ok = passedEvals === totalEvals && passedAssertions === totalAssertions;
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
