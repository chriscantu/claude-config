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
 *   bun run tests/eval-runner.ts define-the-problem   # one skill
 *   bun run tests/eval-runner.ts --dry-run            # validate JSON, skip API calls
 *   CLAUDE_BIN=/path/to/claude bun run tests/eval-runner.ts
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
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
  const parsed = JSON.parse(raw) as EvalFile;
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
      if (a.type === "regex" || a.type === "not_regex") {
        // Validate the regex compiles. Surface bad patterns at load time, not run time.
        new RegExp(a.pattern, a.flags ?? "");
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

function runClaude(prompt: string): { stdout: string; stderr: string; code: number } {
  const res = spawnSync(claudeBin, ["--print"], {
    input: prompt,
    encoding: "utf8",
    timeout: 5 * 60 * 1000,
  });
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    code: res.status ?? -1,
  };
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
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);

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

      const { stdout, stderr, code } = runClaude(e.prompt);
      const transcriptFile = join(resultsDir, `${skillName}-${e.name}-${timestamp}.md`);
      writeFileSync(
        transcriptFile,
        `# ${skillName} / ${e.name}\n\n## Prompt\n\n${e.prompt}\n\n## Response\n\n${stdout}\n\n## Stderr\n\n${stderr}\n`,
      );

      if (code !== 0) {
        console.log(`    ${red("✗")} claude exited ${code}: ${stderr.trim().split("\n")[0] ?? "(no stderr)"}`);
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

  process.exit(passedAssertions === totalAssertions ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
