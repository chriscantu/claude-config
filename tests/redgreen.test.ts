import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Tests for bin/redgreen.fish's eval-folder guard. Every run points
// CLAUDE_EVAL_HOME at a fixture, so the real ~/.claude-eval is never touched.

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "bin", "redgreen.fish");

const fixtures: string[] = [];
afterEach(() => {
  while (fixtures.length > 0) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

describe("redgreen.fish", () => {
  test("eval folder linked to another checkout → exit 2, rule link untouched", () => {
    const evalHome = mkdtempSync(join(tmpdir(), "redgreen-eval-"));
    fixtures.push(evalHome);
    symlinkSync("/some/other/checkout/global/CLAUDE.md", join(evalHome, "CLAUDE.md"));
    mkdirSync(join(evalHome, "rules"));
    const ruleLink = join(evalHome, "rules", "goal-driven.md");
    symlinkSync("/some/other/checkout/rules/goal-driven.md", ruleLink);

    const r = spawnSync("fish", [SCRIPT, "goal-driven", "--dry-run", "--green", "0", "--red", "0"], {
      env: { ...process.env, CLAUDE_EVAL_HOME: evalHome },
      encoding: "utf8",
    });
    if (r.error) throw r.error;
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Run: fish bin/setup-eval-home.fish");
    expect(readlinkSync(ruleLink)).toBe("/some/other/checkout/rules/goal-driven.md");
  });
});
