import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Regression tests for validate.fish Phase 1x (HARD-GATE count reconciliation,
// issue #527).
//
// The HARD-GATE count is asserted in three docs that must agree — global/CLAUDE.md
// ("current N HARD-GATE rules"), rules/GOVERNANCE.md ("N files, M cap slots"), and
// the rules/README.md "What lives here" table (one row per rule). No rule is
// individually wrong when they drift, so per-rule RED/GREEN evals cannot see the
// mismatch by construction. Phase 1x locks the invariant:
//   CLAUDE.md cap number  == GOVERNANCE cap slots   (floor-trio counts as one slot)
//   README HARD-GATE rows == GOVERNANCE file count
//
// Tests:
//   A) Consistent 8/8/10 → passes
//   B) README bumped to 11 rows, GOVERNANCE still 10 files → fail (README↔GOVERNANCE)
//   C) CLAUDE cap=9, GOVERNANCE slots=8 → fail (CLAUDE↔GOVERNANCE)
//   D) Missing global/CLAUDE.md → loud fail (zero-state)
//   E) Garbled cap number (no digits) → loud fail (parse failure)

const REPO = resolve(import.meta.dir, "..");
const VALIDATE = join(REPO, "validate.fish");

type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const runValidate = (fixture: string): RunResult => {
  const result = spawnSync("fish", [VALIDATE], {
    env: { ...process.env, CLAUDE_CONFIG_REPO_DIR: fixture },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const extractPhase1x = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Phase 1x: HARD-GATE count reconciliation"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1x header not found.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
    );
  }
  const slice: string[] = [];
  for (let i = headerIdx; i < lines.length; i++) {
    slice.push(lines[i]);
    if (i > headerIdx && lines[i] === "") break;
  }
  return slice.join("\n");
};

const fixtures: string[] = [];

const makeRepoFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1x-"));
  for (const sub of ["rules", "global", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);
  return dir;
};

// Seed the three count sources. Any arg left undefined omits/garbles that source.
const seedCounts = (
  repo: string,
  opts: { cap?: number | "garbled"; govFiles?: number; govSlots?: number; readmeRows?: number },
): void => {
  if (opts.cap !== undefined) {
    const capText = opts.cap === "garbled" ? "several" : String(opts.cap);
    writeFileSync(
      join(repo, "global", "CLAUDE.md"),
      `**HARD-GATE cap.** The current ${capText} HARD-GATE rules listed in the table are the ceiling.\n`,
    );
  }
  if (opts.govFiles !== undefined && opts.govSlots !== undefined) {
    writeFileSync(
      join(repo, "rules", "GOVERNANCE.md"),
      `Current count: **${opts.govFiles} files, ${opts.govSlots} cap slots.**\n`,
    );
  }
  if (opts.readmeRows !== undefined) {
    // Rule names must be letters-only to match the phase's `[a-z-]+\.md` row
    // pattern (real rule filenames carry no digits).
    const rows = Array.from(
      { length: opts.readmeRows },
      (_, i) => `| \`rule-${String.fromCharCode(97 + i)}.md\` | HARD-GATE | stub concern ${i} |`,
    ).join("\n");
    writeFileSync(join(repo, "rules", "README.md"), `${rows}\n`);
  }
};

const TMP_PREFIX = tmpdir();

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    if (!dir.startsWith(TMP_PREFIX)) {
      console.error(`afterEach: refusing to clean non-tmp path ${dir}`);
      continue;
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.error(`afterEach: rmSync failed for ${dir}: ${(e as Error).message}`);
    }
  }
});

describe("validate.fish Phase 1x (HARD-GATE count reconciliation, issue #527)", () => {
  test("A: consistent 8/8/10 → passes", () => {
    const repo = makeRepoFixture();
    seedCounts(repo, { cap: 8, govFiles: 10, govSlots: 8, readmeRows: 10 });
    const out = extractPhase1x(runValidate(repo));
    expect(out).toMatch(/✓.*HARD-GATE counts reconcile/);
    expect(out).not.toMatch(/✗.*Phase 1x/);
  });

  test("B: README rows drift above GOVERNANCE files → fail naming README↔GOVERNANCE", () => {
    const repo = makeRepoFixture();
    seedCounts(repo, { cap: 8, govFiles: 10, govSlots: 8, readmeRows: 11 });
    const result = runValidate(repo);
    const out = extractPhase1x(result);
    expect(out).toMatch(/✗.*README HARD-GATE rows=11.*GOVERNANCE files=10/);
    expect(result.exitCode).toBe(1);
  });

  test("C: CLAUDE cap drifts above GOVERNANCE slots → fail naming CLAUDE↔GOVERNANCE", () => {
    const repo = makeRepoFixture();
    seedCounts(repo, { cap: 9, govFiles: 10, govSlots: 8, readmeRows: 10 });
    const result = runValidate(repo);
    const out = extractPhase1x(result);
    expect(out).toMatch(/✗.*CLAUDE\.md cap=9.*GOVERNANCE slots=8/);
    expect(result.exitCode).toBe(1);
  });

  test("D: missing global/CLAUDE.md → loud fail (zero-state)", () => {
    const repo = makeRepoFixture();
    // Omit cap → no global/CLAUDE.md written.
    seedCounts(repo, { govFiles: 10, govSlots: 8, readmeRows: 10 });
    const result = runValidate(repo);
    const out = extractPhase1x(result);
    expect(out).toMatch(/✗.*missing global\/CLAUDE\.md/);
    expect(result.exitCode).toBe(1);
  });

  test("E: garbled cap number → loud fail (parse failure)", () => {
    const repo = makeRepoFixture();
    seedCounts(repo, { cap: "garbled", govFiles: 10, govSlots: 8, readmeRows: 10 });
    const result = runValidate(repo);
    const out = extractPhase1x(result);
    expect(out).toMatch(/✗.*could not parse cap number/);
    expect(result.exitCode).toBe(1);
  });
});
