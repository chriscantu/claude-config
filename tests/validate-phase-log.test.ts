import { test, expect } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, readFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

test("validate.fish --log-path writes valid JSONL per phase", () => {
  const tmp = mkdtempSync(join(tmpdir(), "validate-log-"));
  const logPath = join(tmp, "phase-log.jsonl");

  const result = spawnSync(
    "fish",
    ["validate.fish", "--log-path", logPath],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  expect(result.status === 0 || result.status === 1).toBe(true);
  expect(existsSync(logPath)).toBe(true);

  const lines = readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);
  expect(lines.length).toBeGreaterThan(0);

  for (const line of lines) {
    const entry = JSON.parse(line);
    expect(typeof entry.ts).toBe("string");
    expect(typeof entry.phase).toBe("string");
    expect(["pass", "fail", "warn"]).toContain(entry.status);
    expect(typeof entry.duration_ms).toBe("number");
  }

  rmSync(tmp, { recursive: true });
});
