#!/usr/bin/env bun
/**
 * Executable eval runner for skill evals.
 *
 * Reads `skills/<name>/evals/evals.json`, sends each prompt to `claude --print`,
 * and applies rubric assertions (regex / not_regex / contains / not_contains)
 * against the response. Exits non-zero on any failed assertion.
 *
 * Usage:
 *   bun run tests/eval-runner.ts                      # all skills
 *   bun run tests/eval-runner.ts define-the-problem   # one skill (must match a skills/<name>/evals/evals.json directory)
 *   bun run tests/eval-runner.ts --dry-run            # validate JSON + regex compile, skip API calls
 *   env CLAUDE_BIN=/path/to/claude bun run tests/eval-runner.ts   # `env` prefix because fish lacks inline VAR=value
 *
 * Eval file schema:
 *   {
 *     "skill": "<name>",
 *     "description": "<why these evals exist>",
 *     "evals": [
 *       {
 *         "name": "<slug>",
 *         "summary": "<one-line>",
 *         "prompt": "<verbatim user prompt>",
 *         "assertions": [
 *           { "type": "contains" | "not_contains", "value": "...", "description": "..." },
 *           { "type": "regex" | "not_regex", "pattern": "...", "flags": "i", "description": "..." }
 *         ]
 *       }
 *     ]
 *   }
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Assertion =
  | { type: "contains" | "not_contains"; value: string; description: string }
  | { type: "regex" | "not_regex"; pattern: string; flags?: string; description: string };

interface Eval {
  name: string;
  summary?: string;
  prompt: string;
  assertions: Assertion[];
}

interface EvalFile {
  skill: string;
  description?: string;
  evals: Eval[];
}

interface AssertionResult {
  ok: boolean;
  description: string;
  detail?: string;
}

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(repoDir, "skills");
const resultsDir = join(repoDir, "tests", "results");
const claudeBin = process.env.CLAUDE_BIN ?? "claude";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skillFilter = args.find((a) => !a.startsWith("--"));

function loadEvalFile(skillName: string): EvalFile | null {
  const file = join(skillsDir, skillName, "evals", "evals.json");
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8");
  let parsed: EvalFile;
  try {
    parsed = JSON.parse(raw) as EvalFile;
  } catch (err) {
    throw new Error(`${file}: invalid JSON — ${(err as Error).message}`);
  }
  if (parsed.skill !== skillName) {
    throw new Error(`${file}: 'skill' field '${parsed.skill}' doesn't match directory '${skillName}'`);
  }
  if (!Array.isArray(parsed.evals) || parsed.evals.length === 0) {
    throw new Error(`${file}: 'evals' must be a non-empty array`);
  }
  for (const e of parsed.evals) {
    if (!e.name || !e.prompt || !Array.isArray(e.assertions) || e.assertions.length === 0) {
      throw new Error(`${file}: eval '${e.name ?? "(unnamed)"}' missing name/prompt/assertions`);
    }
    for (const a of e.assertions as Assertion[]) {
      if (!a.type || !a.description) {
        throw new Error(`${file}: eval '${e.name}' has assertion missing 'type' or 'description'`);
      }
      if (a.type === "contains" || a.type === "not_contains") {
        if (typeof a.value !== "string" || a.value.length === 0) {
          throw new Error(`${file}: eval '${e.name}' ${a.type} assertion requires non-empty 'value' string`);
        }
      } else if (a.type === "regex" || a.type === "not_regex") {
        if (typeof a.pattern !== "string" || a.pattern.length === 0) {
          throw new Error(`${file}: eval '${e.name}' ${a.type} assertion requires non-empty 'pattern' string`);
        }
        // Surface bad patterns at load time, not run time.
        new RegExp(a.pattern, a.flags ?? "");
      } else {
        throw new Error(`${file}: eval '${e.name}' has unknown assertion type '${(a as { type: string }).type}'`);
      }
    }
  }
  return parsed;
}

function discoverSkills(): string[] {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d: { isDirectory(): boolean; name: string }) => d.isDirectory() && existsSync(join(skillsDir, d.name, "evals", "evals.json")))
    .map((d: { name: string }) => d.name)
    .sort();
}

interface ClaudeResult {
  stdout: string;
  stderr: string;
  code: number;
  failure?: string; // human-readable reason: spawn error, signal, or timeout
}

/**
 * Scratch cwd: running in-repo lets Claude read the skill files and recognize
 * prompts as eval fixtures. Empty tmpdir removes that tell.
 * bypassPermissions: skills invoke Bash/Write; an interactive permission gate
 * stalls --print indefinitely. The scratch dir caps only relative-path writes
 * — absolute paths and network calls are still unscoped, so evals must not
 * run adversarial prompts without further sandboxing.
 */
function runClaude(prompt: string): ClaudeResult {
  const timeoutMs = 5 * 60 * 1000;
  const scratchDir = mkdtempSync(join(tmpdir(), "claude-eval-"));
  try {
    const res = spawnSync(claudeBin, ["--print", "--permission-mode", "bypassPermissions"], {
      input: prompt,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      cwd: scratchDir,
    });
    let failure: string | undefined;
    if (res.error) {
      failure = `spawn error: ${(res.error as NodeJS.ErrnoException).code ?? ""} ${res.error.message}`.trim();
    } else if (res.signal) {
      // spawnSync sets signal to SIGTERM on timeout (Node default killSignal).
      failure = res.signal === "SIGTERM" ? `timed out after ${timeoutMs / 1000}s (SIGTERM)` : `killed by signal ${res.signal}`;
    } else if (res.status === null) {
      failure = "process exited without status (no signal, no error)";
    }
    return {
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
      code: res.status ?? -1,
      failure,
    };
  } finally {
    try {
      rmSync(scratchDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`[eval-runner] failed to clean scratch dir ${scratchDir}: ${(err as Error).message}`);
    }
  }
}

function evaluate(assertion: Assertion, output: string): AssertionResult {
  switch (assertion.type) {
    case "contains": {
      const ok = output.includes(assertion.value);
      return { ok, description: assertion.description, detail: ok ? undefined : `expected substring: ${JSON.stringify(assertion.value)}` };
    }
    case "not_contains": {
      const ok = !output.includes(assertion.value);
      return { ok, description: assertion.description, detail: ok ? undefined : `forbidden substring present: ${JSON.stringify(assertion.value)}` };
    }
    case "regex": {
      const re = new RegExp(assertion.pattern, assertion.flags ?? "");
      const ok = re.test(output);
      return { ok, description: assertion.description, detail: ok ? undefined : `regex did not match: /${assertion.pattern}/${assertion.flags ?? ""}` };
    }
    case "not_regex": {
      const re = new RegExp(assertion.pattern, assertion.flags ?? "");
      const ok = !re.test(output);
      return { ok, description: assertion.description, detail: ok ? undefined : `forbidden regex matched: /${assertion.pattern}/${assertion.flags ?? ""}` };
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

async function main() {
  const skills = skillFilter ? [skillFilter] : discoverSkills();
  if (skills.length === 0) {
    console.error("No skills with evals/evals.json found.");
    process.exit(1);
  }

  if (!dryRun) {
    const probe = spawnSync(claudeBin, ["--version"], { encoding: "utf8" });
    if (probe.status !== 0) {
      console.error(`Error: '${claudeBin}' not runnable. Set CLAUDE_BIN or use --dry-run.`);
      process.exit(1);
    }
  }

  mkdirSync(resultsDir, { recursive: true });
  // ISO timestamp truncated to seconds — keeps re-runs within the same minute from
  // overwriting each other's transcripts.
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  let totalEvals = 0;
  let passedEvals = 0;
  let totalAssertions = 0;
  let passedAssertions = 0;

  for (const skillName of skills) {
    let evalFile: EvalFile;
    try {
      const loaded = loadEvalFile(skillName);
      if (!loaded) {
        console.error(red(`✗ ${skillName}: no evals/evals.json`));
        process.exit(1);
      }
      evalFile = loaded;
    } catch (err) {
      console.error(red(`✗ ${skillName}: ${(err as Error).message}`));
      process.exit(1);
    }

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

      const { stdout, stderr, code, failure } = runClaude(e.prompt);
      const transcriptFile = join(resultsDir, `${skillName}-${e.name}-${timestamp}.md`);
      try {
        writeFileSync(
          transcriptFile,
          `# ${skillName} / ${e.name}\n\n## Prompt\n\n${e.prompt}\n\n## Response\n\n${stdout}\n\n## Stderr\n\n${stderr}\n`,
        );
      } catch (err) {
        // Transcript loss is not a correctness failure — log and keep evaluating.
        console.log(`    ${dim(`(transcript write failed: ${(err as Error).message})`)}`);
      }

      if (failure || code !== 0) {
        // Count the planned assertions as failed so the exit gate can't report
        // "all assertions passed" when an entire eval crashed.
        totalAssertions += e.assertions.length;
        const reason = failure ?? `claude exited ${code}: ${stderr.trim().split("\n")[0] ?? "(no stderr)"}`;
        console.log(`    ${red("✗")} ${reason}`);
        continue;
      }

      let evalPassed = true;
      for (const a of e.assertions) {
        totalAssertions++;
        const result = evaluate(a, stdout);
        if (result.ok) {
          passedAssertions++;
          console.log(`    ${green("✓")} ${result.description}`);
        } else {
          evalPassed = false;
          console.log(`    ${red("✗")} ${result.description}`);
          if (result.detail) console.log(`        ${dim(result.detail)}`);
        }
      }
      if (evalPassed) passedEvals++;
      console.log(dim(`      transcript → ${transcriptFile.replace(repoDir + "/", "")}`));
    }
    console.log("");
  }

  console.log("━".repeat(60));
  const evalLine = `${passedEvals}/${totalEvals} evals passed`;
  const assertionLine = `${passedAssertions}/${totalAssertions} assertions passed`;
  console.log(passedEvals === totalEvals ? green(evalLine) : red(evalLine));
  console.log(passedAssertions === totalAssertions ? green(assertionLine) : red(assertionLine));

  // Both gates must pass: every eval ran AND every assertion passed. Checking
  // assertions alone would let a crashed eval slip through as a green build.
  const ok = passedEvals === totalEvals && passedAssertions === totalAssertions;
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
