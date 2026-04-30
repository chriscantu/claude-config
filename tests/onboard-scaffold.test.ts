import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "bin", "onboard-scaffold.fish");

type RunResult = { exitCode: number; stdout: string; stderr: string };

const runScaffold = (cwd: string, ...args: string[]): RunResult => {
  const result = spawnSync("fish", [SCRIPT, ...args], { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const fixtures: string[] = [];
const makeFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "onboard-scaffold-test-"));
  fixtures.push(dir);
  return dir;
};

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

describe("bin/onboard-scaffold.fish", () => {
  test("refuses to overwrite an existing non-empty target directory", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");
    mkdirSync(target);
    writeFileSync(join(target, "preexisting.txt"), "do not clobber");

    const r = runScaffold(root, "--target", target, "--cadence", "standard", "--no-gh");

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("refusing to scaffold");
  });
});
