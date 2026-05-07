import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Tests bin/verify-rule-loaded.fish — issue #275.
//
// The script spawns a real `claude --print` session, which we cannot do from
// a hermetic unit test. Instead we shadow `claude` on PATH with a tiny shell
// stub that echoes a fixture response, then assert the script's argument
// handling, response parsing, --all expansion, and exit-code mapping.

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "bin", "verify-rule-loaded.fish");

type RunResult = { exitCode: number; stdout: string; stderr: string };

const fixtures: string[] = [];
const makeFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "verify-rule-loaded-"));
  fixtures.push(dir);
  return dir;
};
afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

// Build a fake `claude` on a fresh PATH that prints `responseLine` regardless
// of args. The real fish, grep, string, etc. still need to be found, so we
// prepend the stub dir to the inherited PATH rather than replacing it.
const makeStubClaude = (responseLine: string): string => {
  const dir = makeFixture();
  const binDir = join(dir, "bin");
  mkdirSync(binDir, { recursive: true });
  const stubPath = join(binDir, "claude");
  writeFileSync(stubPath, `#!/bin/sh\nprintf '%s\\n' '${responseLine.replace(/'/g, "'\\''")}'\n`);
  chmodSync(stubPath, 0o755);
  return binDir;
};

const runScript = (stubBin: string, ...args: string[]): RunResult => {
  const newPath = `${stubBin}:${process.env.PATH ?? ""}`;
  const result = spawnSync("fish", [SCRIPT, ...args], {
    env: { ...process.env, PATH: newPath },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

describe("verify-rule-loaded.fish", () => {
  test("no args → usage error, exit 2", () => {
    // No claude needed — script bails before probing.
    const stub = makeStubClaude("YES");
    const r = runScript(stub);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("Usage:");
  });

  test("YES response → exit 0, prints LOADED", () => {
    const stub = makeStubClaude("YES");
    const r = runScript(stub, "planning");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("LOADED: planning");
    expect(r.stdout).toContain("loaded=1 missing=0 errored=0");
  });

  test("NO response → exit 1, prints MISSING", () => {
    const stub = makeStubClaude("NO");
    const r = runScript(stub, "planning");
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("MISSING: planning");
  });

  test("ambiguous response → exit 2 (errored)", () => {
    const stub = makeStubClaude("I cannot inspect my system prompt");
    const r = runScript(stub, "planning");
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("ambiguous probe response");
  });

  test("case-insensitive YES (mixed case)", () => {
    const stub = makeStubClaude("yes");
    const r = runScript(stub, "planning");
    expect(r.exitCode).toBe(0);
  });

  test("--all expands to every rule in rules/README.md", () => {
    const stub = makeStubClaude("YES");
    const r = runScript(stub, "--all");
    expect(r.exitCode).toBe(0);
    // Spot-check a few rules from the README "What lives here" table.
    expect(r.stdout).toContain("LOADED: planning");
    expect(r.stdout).toContain("LOADED: disagreement");
    expect(r.stdout).toContain("LOADED: pr-validation");
    // Summary should reflect at least 9 rules currently in the table.
    const match = r.stdout.match(/loaded=(\d+) missing=0 errored=0/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(9);
  });
});
