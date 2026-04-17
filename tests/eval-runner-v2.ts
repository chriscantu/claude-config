#!/usr/bin/env bun
/**
 * Stream-json CLI eval runner (v2).
 *
 * Spawns `claude --print --output-format stream-json`, parses the NDJSON event
 * stream, and runs assertions against *structured signals* (final text, tool
 * uses, skill invocations) instead of raw prose. Step 2 of issue #86 — adds
 * structural assertions while staying on Max auth (no API credits billed).
 *
 * Why this substrate (vs. v1 plain `claude --print` or the earlier SDK attempt):
 *   - v1 only sees stdout text: regex-on-prose is brittle and can't tell a
 *     "Skill invoked" block from a model describing a skill in prose.
 *   - The SDK path works but bills API credits separately from Max; rejected.
 *   - stream-json gives us tool-use blocks directly from the CLI transport on
 *     the user's existing Max auth (apiKeySource: "none" on init).
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
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Assertion,
  type EvalFile,
  type Signals,
  discoverSkills,
  evaluate,
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

interface CliRun {
  stdout: string;
  stderr: string;
  code: number;
  failure?: string;
}

function runClaude(prompt: string): CliRun {
  const timeoutMs = 5 * 60 * 1000;
  const res = spawnSync(
    claudeBin,
    ["--print", "--output-format", "stream-json", "--verbose"],
    { input: prompt, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
  );
  let failure: string | undefined;
  if (res.error) {
    failure = `spawn error: ${(res.error as NodeJS.ErrnoException).code ?? ""} ${res.error.message}`.trim();
  } else if (res.signal) {
    failure = res.signal === "SIGTERM" ? `timed out after ${timeoutMs / 1000}s (SIGTERM)` : `killed by signal ${res.signal}`;
  } else if (res.status === null) {
    failure = "process exited without status (no signal, no error)";
  }
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "", code: res.status ?? -1, failure };
}

function colour(s: string, code: string): string {
  return process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
}
const green = (s: string) => colour(s, "32");
const red = (s: string) => colour(s, "31");
const dim = (s: string) => colour(s, "2");
const bold = (s: string) => colour(s, "1");

function writeTranscript(
  path: string,
  skillName: string,
  evalName: string,
  prompt: string,
  signals: Signals | null,
  rawStdout: string,
  rawStderr: string,
  failure?: string,
): void {
  const skillsSeen = signals?.skillInvocations.map((s) => s.skill) ?? [];
  const toolsSeen = signals?.toolUses.map((t) => t.name) ?? [];
  const meta = [
    `stdout_bytes: ${rawStdout.length}`,
    `stderr_bytes: ${rawStderr.length}`,
    `tool_uses: ${toolsSeen.length === 0 ? "(none)" : toolsSeen.join(", ")}`,
    `skills_invoked: ${skillsSeen.length === 0 ? "(none)" : skillsSeen.join(", ")}`,
  ].join("\n");
  const body = [
    `# ${skillName} / ${evalName} (v2)`,
    "",
    "## Prompt",
    "",
    prompt,
    "",
    "## Final text",
    "",
    signals?.finalText ?? "(no signals — run failed)",
    "",
    "## Metadata",
    "",
    meta,
  ];
  if (failure) {
    body.push("", "## Failure", "", failure);
  }
  if (rawStderr.trim()) {
    body.push("", "## Stderr", "", rawStderr);
  }
  body.push("");
  try {
    writeFileSync(path, body.join("\n"));
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
      const { stdout, stderr, code, failure } = runClaude(e.prompt);

      if (failure || code !== 0) {
        totalAssertions += e.assertions.length;
        const reason = failure ?? `claude exited ${code}: ${stderr.trim().split("\n")[0] ?? "(no stderr)"}`;
        console.log(`    ${red("✗")} ${reason}`);
        writeTranscript(transcriptFile, skillName, e.name, e.prompt, null, stdout, stderr, reason);
        console.log(dim(`      transcript → ${transcriptFile.replace(repoDir + "/", "")}`));
        continue;
      }

      const events = parseStreamJson(stdout);
      const signals = extractSignals(events);
      writeTranscript(transcriptFile, skillName, e.name, e.prompt, signals, stdout, stderr);

      let evalPassed = true;
      for (const a of e.assertions as Assertion[]) {
        totalAssertions++;
        const r = evaluate(a, signals);
        if (r.ok) {
          passedAssertions++;
          console.log(`    ${green("✓")} ${r.description}`);
        } else {
          evalPassed = false;
          console.log(`    ${red("✗")} ${r.description}`);
          if (r.detail) console.log(`        ${dim(r.detail)}`);
        }
      }
      if (evalPassed) passedEvals++;
      console.log(
        dim(
          `      transcript → ${transcriptFile.replace(repoDir + "/", "")}` +
            ` (tools=${signals.toolUses.length} skills=${signals.skillInvocations.length})`,
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
