import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VALIDATE, runPhase, runValidate, useFixtures } from "./validate-harness";

// Tests for validate.fish `--phase <id>[,<id>...]` selection.
//
// The phase suites rely on --phase to run one phase against a fixture, so the
// flag's own contract needs pinning: bad ids fail loudly instead of selecting
// nothing, a selection keeps canonical order, and the exit code reflects only
// the selected phases.

const makeFixture = useFixtures("validate-phase-selection-");

const headers = (stdout: string): string[] =>
  stdout.split("\n").filter((line) => line.startsWith("── "));

describe("validate.fish --phase selection", () => {
  test("unknown phase id → exit 2 with message, no phase runs", () => {
    const r = runPhase(makeFixture(), "bogus");
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("unknown phase id: 'bogus'");
    expect(headers(r.stdout)).toEqual([]);
  });

  test("empty id from a trailing comma → exit 2", () => {
    const r = runPhase(makeFixture(), "1w,");
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("unknown phase id: ''");
  });

  test("--phase without a value → exit 2", () => {
    const r = runValidate(makeFixture(), { args: ["--phase"] });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("--phase requires a phase id argument");
  });

  test("--skill combined with --phase → exit 2", () => {
    const r = runValidate(makeFixture(), { args: ["--skill", "x", "--phase", "1a"] });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("--skill and --phase cannot be combined");
  });

  test("selection runs in canonical order, once per id, without the Phase 1 banner", () => {
    // 1h runs after 1a in a full run; ask for them reversed and repeated.
    const r = runValidate(makeFixture(), { args: ["--phase", "1h,1a", "--phase=1a"] });
    expect(headers(r.stdout)).toEqual([
      "── Skill frontmatter",
      "── Hook ↔ user docs consistency",
    ]);
    expect(r.stdout).not.toContain("Phase 1: Static Validation");
    expect(r.stdout).toContain("Results: ");
  });

  test("exit code reflects only the selected phases", () => {
    // Empty rules/ fails Phase 1t; no eval suites passes Phase 1w.
    const fixture = makeFixture();
    expect(runPhase(fixture, "1t").exitCode).toBe(1);
    expect(runPhase(fixture, "1w").exitCode).toBe(0);
  });

  test("id listed in all_phase_ids without its function → loud fail, not a silent pass", () => {
    // Simulates a soft-retire that commented out the function but left the
    // id in all_phase_ids.
    const fixture = makeFixture();
    const original = readFileSync(VALIDATE, "utf8");
    const patched = original.replace(
      "\nfunction _phase_1w\n",
      "\nfunction _phase_1w_retired\n",
    );
    expect(patched).not.toBe(original);
    const script = join(fixture, "validate-patched.fish");
    writeFileSync(script, patched);
    const r = runPhase(fixture, "1w", { script });
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("phase 1w is in all_phase_ids but _phase_1w is not defined");
  });

  test("HARNESS_VALIDATE_LOG is ignored under --phase; explicit --log-path still logs", () => {
    // A partial run would log only the selected phases and make every other
    // phase look like a 0-firing retirement candidate to Phase 1q.
    const fixture = makeFixture();
    runPhase(fixture, "1w", { env: { HARNESS_VALIDATE_LOG: "1" } });
    expect(existsSync(join(fixture, ".claude/state/validate-phase-log.jsonl"))).toBe(false);

    const log = join(fixture, "explicit.jsonl");
    runPhase(fixture, "1w", { args: ["--log-path", log] });
    const rows = readFileSync(log, "utf8").trim().split("\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('"phase":"1w"');
  });
});
