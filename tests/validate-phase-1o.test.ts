import { test, expect } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";

const repo = process.cwd();
const fixDir = "tests/fixtures/validate-phase-1o";

function runPhase1o(opts: { logPath?: string; validateFishPath?: string }) {
  const args = ["validate.fish", "--phase-1o-only"];
  if (opts.logPath) args.push("--log-path", opts.logPath);
  if (opts.validateFishPath)
    args.push("--validate-fish-path", opts.validateFishPath);
  return spawnSync("fish", args, { cwd: repo, encoding: "utf8" });
}

test("retirement-candidate WARN suppressed when active phases all fire", () => {
  const result = runPhase1o({
    logPath: join(fixDir, "synthetic-log/phase-log.jsonl"),
  });
  // Active phases 1a/1b/1c all fired in the synthetic log; no candidate WARN.
  expect(result.stderr + result.stdout).not.toMatch(/Retirement candidate/i);
});

test("hard-delete-eligible WARN for tombstone >=12mo old + zero log activity", () => {
  const result = runPhase1o({
    logPath: join(fixDir, "synthetic-log/phase-log.jsonl"),
    validateFishPath: join(fixDir, "aging-soft-retire/validate.fish"),
  });
  expect(result.stderr + result.stdout).toMatch(/hard-delete eligible/i);
});

test("HARD-FAIL on commented phase block lacking tombstone header", () => {
  const result = runPhase1o({
    validateFishPath: join(fixDir, "malformed-tombstone/validate.fish"),
  });
  expect(result.status).toBe(1);
  expect(result.stderr + result.stdout).toMatch(/tombstone/i);
});

test("silent when log has <10 entries (under threshold)", () => {
  const result = runPhase1o({
    logPath: join(fixDir, "sparse-log/phase-log.jsonl"),
  });
  expect(result.stderr + result.stdout).not.toMatch(
    /Retirement candidate|hard-delete eligible/i,
  );
});
