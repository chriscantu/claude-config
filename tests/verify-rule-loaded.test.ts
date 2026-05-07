import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Resolve fish absolute path once. The "claude CLI missing" test sanitizes
// PATH to a minimal set, but fish itself lives outside that set on macOS
// (/opt/homebrew/bin) — invoke fish by absolute path so PATH only governs
// what fish-the-script can find.
const FISH = (() => {
  const which = spawnSync("which", ["fish"], { encoding: "utf8" });
  const path = which.stdout.trim();
  if (!path) throw new Error("fish not found in PATH — install fish to run these tests");
  return path;
})();

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
    } catch (e) {
      // Best-effort tmp cleanup; tmpdir reaper handles stragglers. Surface
      // anything unexpected so a leak isn't completely silent.
      console.warn(`tmpdir cleanup failed for ${dir}:`, e);
    }
  }
});

type StubOpts = {
  // Plain stdout the stub prints regardless of args.
  response?: string;
  // If set, the stub exits with this rc (no stdout).
  exitWith?: number;
  // If set, the stub writes this to stderr.
  stderr?: string;
  // If true, the stub records its argv to <binDir>/argv.log so the test can
  // inspect what flags the script passed (e.g. --model X).
  recordArgs?: boolean;
};

const makeStubClaude = (opts: StubOpts = {}): string => {
  const dir = makeFixture();
  const binDir = join(dir, "bin");
  mkdirSync(binDir, { recursive: true });
  const stubPath = join(binDir, "claude");
  const argvLog = join(binDir, "argv.log");
  const escape = (s: string) => s.replace(/'/g, "'\\''");
  const lines = ["#!/bin/sh"];
  if (opts.recordArgs) {
    lines.push(`printf '%s\\n' "$*" >> '${escape(argvLog)}'`);
  }
  if (opts.stderr) {
    lines.push(`printf '%s\\n' '${escape(opts.stderr)}' >&2`);
  }
  if (opts.exitWith !== undefined) {
    lines.push(`exit ${opts.exitWith}`);
  } else {
    lines.push(`printf '%s\\n' '${escape(opts.response ?? "")}'`);
  }
  writeFileSync(stubPath, lines.join("\n") + "\n");
  chmodSync(stubPath, 0o755);
  return binDir;
};

const runScript = (
  stubBin: string | null,
  args: string[],
  env: Record<string, string> = {},
): RunResult => {
  // null stubBin → run with sanitized PATH that excludes any stub.
  const basePath = stubBin
    ? `${stubBin}:${process.env.PATH ?? ""}`
    : "/usr/bin:/bin";
  const result = spawnSync(FISH, [SCRIPT, ...args], {
    env: { ...process.env, PATH: basePath, ...env },
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
    const stub = makeStubClaude({ response: "YES" });
    const r = runScript(stub, []);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("Usage:");
  });

  test("claude CLI missing → exit 2", () => {
    const r = runScript(null, ["planning"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("'claude' CLI not found");
  });

  test("unknown rule name → exit 2 (typo guard)", () => {
    const stub = makeStubClaude({ response: "YES" });
    const r = runScript(stub, ["planing"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("not in rules/README.md table");
  });

  test("YES response → exit 0, prints LOADED", () => {
    const stub = makeStubClaude({ response: "YES" });
    const r = runScript(stub, ["planning"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("LOADED: planning");
    expect(r.stdout).toContain("loaded=1 missing=0 errored=0");
  });

  test("YES with trailing period → exit 0", () => {
    const stub = makeStubClaude({ response: "YES." });
    const r = runScript(stub, ["planning"]);
    expect(r.exitCode).toBe(0);
  });

  test("NO response → exit 1, prints MISSING", () => {
    const stub = makeStubClaude({ response: "NO" });
    const r = runScript(stub, ["planning"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("MISSING: planning");
  });

  test("YES-then-negation → fails closed as ambiguous (exit 2)", () => {
    // Highest-impact silent-failure mode: a model that leads with YES but
    // negates after. Strict ^YES[.!]?$ match must reject this.
    const stub = makeStubClaude({
      response: "YES, however the rule does NOT appear in my context.",
    });
    const r = runScript(stub, ["planning"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("ambiguous probe response");
  });

  test("ambiguous response → exit 2", () => {
    const stub = makeStubClaude({ response: "I cannot inspect my system prompt" });
    const r = runScript(stub, ["planning"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("ambiguous probe response");
  });

  test("case-insensitive yes (lowercase)", () => {
    const stub = makeStubClaude({ response: "yes" });
    const r = runScript(stub, ["planning"]);
    expect(r.exitCode).toBe(0);
  });

  test("claude rc != 0 → exit 2 with surfaced stderr", () => {
    const stub = makeStubClaude({
      exitWith: 1,
      stderr: "auth: token expired",
    });
    const r = runScript(stub, ["planning"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("claude --print failed");
    // Captured stderr must reach the user — that's the silent-failure fix.
    expect(r.stderr).toContain("auth: token expired");
  });

  test("empty claude response → exit 2", () => {
    const stub = makeStubClaude({ response: "" });
    const r = runScript(stub, ["planning"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("empty response");
  });

  test("VERIFY_RULE_MODEL env var is honored", () => {
    const stub = makeStubClaude({ response: "YES", recordArgs: true });
    const r = runScript(stub, ["planning"], { VERIFY_RULE_MODEL: "sonnet" });
    expect(r.exitCode).toBe(0);
    // Visibility line announces chosen model.
    expect(r.stderr).toContain("Probing with model=sonnet");
    // Stub recorded its argv — confirm --model sonnet was passed through.
    const argvLog = readFileSync(join(stub, "argv.log"), "utf8");
    expect(argvLog).toContain("--model sonnet");
  });

  test("--all expands to every rule in rules/README.md", () => {
    const stub = makeStubClaude({ response: "YES" });
    const r = runScript(stub, ["--all"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("LOADED: planning");
    expect(r.stdout).toContain("LOADED: disagreement");
    expect(r.stdout).toContain("LOADED: pr-validation");
    const match = r.stdout.match(/loaded=(\d+) missing=0 errored=0/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThanOrEqual(9);
  });

  test("--all aggregates mixed outcomes (one MISSING, rest LOADED)", () => {
    // Rule-aware stub: matches the prompt's path fragment to decide the
    // response. A MISSING rule must surface in the summary even when others
    // pass — this exercises the missing>0 → exit 1 precedence.
    const dir = makeFixture();
    const binDir = join(dir, "bin");
    mkdirSync(binDir, { recursive: true });
    const stubPath = join(binDir, "claude");
    writeFileSync(
      stubPath,
      [
        "#!/bin/sh",
        // Last arg is the prompt; check it for the MISSING-rule path.
        'eval "last=\\${$#}"',
        'case "$last" in',
        '  *rules/disagreement.md*) printf "NO\\n" ;;',
        '  *) printf "YES\\n" ;;',
        "esac",
      ].join("\n") + "\n",
    );
    chmodSync(stubPath, 0o755);

    const r = runScript(binDir, ["--all"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("MISSING: disagreement");
    expect(r.stdout).toContain("LOADED: planning");
    const match = r.stdout.match(/loaded=(\d+) missing=1 errored=0/);
    expect(match).not.toBeNull();
  });
});
