import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, statSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "bin", "onboard-scaffold.fish");

type RunResult = { exitCode: number; stdout: string; stderr: string };

// Git identity env vars so the scaffold's initial `git commit` works in any
// environment, including CI runners without a global ~/.gitconfig. Production
// users have their own config; this only affects the test subprocess.
const GIT_ENV = {
  GIT_AUTHOR_NAME: "Onboard Scaffold Test",
  GIT_AUTHOR_EMAIL: "onboard-scaffold-test@example.invalid",
  GIT_COMMITTER_NAME: "Onboard Scaffold Test",
  GIT_COMMITTER_EMAIL: "onboard-scaffold-test@example.invalid",
};

const runScaffold = (cwd: string, ...args: string[]): RunResult => {
  const result = spawnSync("fish", [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
  });
  if (result.error) {
    throw new Error(`spawn fish failed for args [${args.join(" ")}]: ${result.error.message}`);
  }
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

type GhStubBehavior = { exit?: number; stderr?: string };
type GhStub = { stubDir: string; sentinel: string };

const makeGhStub = (root: string, behavior: GhStubBehavior = {}): GhStub => {
  const stubDir = join(root, "stubs");
  mkdirSync(stubDir);
  const sentinel = join(root, "gh-args.txt");
  const exit = behavior.exit ?? 0;
  const stderrLine = behavior.stderr ? `echo "${behavior.stderr}" >&2\n` : "";
  writeFileSync(
    join(stubDir, "gh"),
    `#!/usr/bin/env sh\nprintf '%s\\n' "$@" > "${sentinel}"\n${stderrLine}exit ${exit}\n`,
  );
  chmodSync(join(stubDir, "gh"), 0o755);
  return { stubDir, sentinel };
};

const runWithStub = (cwd: string, stub: GhStub, ...args: string[]): RunResult => {
  const result = spawnSync("fish", [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV, PATH: `${stub.stubDir}:${process.env.PATH}` },
  });
  if (result.error) {
    throw new Error(`spawn fish failed for args [${args.join(" ")}]: ${result.error.message}`);
  }
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
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`fixture cleanup failed for ${dir}:`, e);
    }
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

  test("rejects missing --target with exit 2 and explanatory stderr", () => {
    const root = makeFixture();
    const r = runScaffold(root, "--cadence", "standard", "--no-gh");
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("missing --target");
  });

  test("rejects unknown flags", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");
    const r = runScaffold(root, "--target", target, "--cadance", "standard", "--no-gh");
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("unknown arg");
  });

  test("scaffolds successfully into an empty pre-existing target dir", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");
    mkdirSync(target);

    const r = runScaffold(root, "--target", target, "--cadence", "standard", "--no-gh");

    expect(r.exitCode).toBe(0);
    expect(existsSync(join(target, "RAMP.md"))).toBe(true);
    expect(existsSync(join(target, ".git"))).toBe(true);
  });

  test("creates the full directory tree", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");

    const r = runScaffold(root, "--target", target, "--cadence", "standard", "--no-gh");

    expect(r.exitCode).toBe(0);
    for (const sub of [
      "stakeholders",
      "interviews/raw",
      "interviews/sanitized",
      "swot",
      "decks/slidev",
      "decisions",
    ]) {
      const p = join(target, sub);
      expect(existsSync(p)).toBe(true);
      expect(statSync(p).isDirectory()).toBe(true);
    }
  });

  test("writes a .gitignore that excludes raw notes and secrets", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");

    runScaffold(root, "--target", target, "--cadence", "standard", "--no-gh");

    const gi = readFileSync(join(target, ".gitignore"), "utf8");
    expect(gi).toContain("interviews/raw/");
    expect(gi).toContain(".env");
    expect(gi).toContain("**/private/");
  });

  test("runs git init and creates an initial commit on main", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");

    runScaffold(root, "--target", target, "--cadence", "standard", "--no-gh");

    expect(existsSync(join(target, ".git"))).toBe(true);

    const log = spawnSync("git", ["-C", target, "log", "--oneline"], { encoding: "utf8" });
    expect(log.status).toBe(0);
    expect(log.stdout.trim().length).toBeGreaterThan(0);
  });

  test("RAMP.md reflects the chosen cadence preset and includes the org name", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");

    runScaffold(root, "--target", target, "--cadence", "aggressive", "--no-gh");

    const ramp = readFileSync(join(target, "RAMP.md"), "utf8");
    expect(ramp).toContain("Cadence: aggressive");
    expect(ramp).toContain("90-Day Ramp Plan — acme");
    expect(ramp).toContain("W9");
  });

  test("standard cadence has W13 terminal week", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");
    runScaffold(root, "--target", target, "--cadence", "standard", "--no-gh");
    const ramp = readFileSync(join(target, "RAMP.md"), "utf8");
    expect(ramp).toContain("Cadence: standard");
    expect(ramp).toContain("W13");
    expect(ramp).not.toContain("W17");
  });

  test("relaxed cadence has W17 terminal week", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");
    runScaffold(root, "--target", target, "--cadence", "relaxed", "--no-gh");
    const ramp = readFileSync(join(target, "RAMP.md"), "utf8");
    expect(ramp).toContain("Cadence: relaxed");
    expect(ramp).toContain("W17");
    expect(ramp).not.toContain("W9");
  });

  test("RAMP.md rejects unknown cadence presets", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");

    const r = runScaffold(root, "--target", target, "--cadence", "yolo", "--no-gh");

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("unknown cadence");
  });

  test("seeds an empty stakeholders/map.md with the canonical sections", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");

    runScaffold(root, "--target", target, "--cadence", "standard", "--no-gh");

    const map = readFileSync(join(target, "stakeholders", "map.md"), "utf8");
    expect(map).toContain("# Stakeholder Map");
    expect(map).toContain("## Direct reports");
    expect(map).toContain("## Cross-functional partners");
    expect(map).toContain("## Skip-level + leadership");
    expect(map).toContain("## Influencers");
  });

  test("gh repo create is invoked when --gh-create yes is passed", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");
    const stub = makeGhStub(root);

    const r = runWithStub(root, stub, "--target", target, "--cadence", "standard", "--gh-create", "yes");

    expect(r.exitCode).toBe(0);
    const args = readFileSync(stub.sentinel, "utf8").trim().split("\n");
    expect(args).toContain("repo");
    expect(args).toContain("create");
    expect(args).toContain("--private");
    expect(args).toContain("--remote=origin");
    expect(args).toContain("--push");
    expect(args.some((a) => a.startsWith("--source="))).toBe(true);
  });

  test("gh is NOT invoked when --gh-create no is passed", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");
    const stub = makeGhStub(root);

    const r = runWithStub(root, stub, "--target", target, "--cadence", "standard", "--gh-create", "no");

    expect(r.exitCode).toBe(0);
    expect(existsSync(stub.sentinel)).toBe(false);
  });

  test("--no-gh overrides --gh-create yes (precedence)", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");
    const stub = makeGhStub(root);

    const r = runWithStub(root, stub, "--target", target, "--cadence", "standard", "--gh-create", "yes", "--no-gh");

    expect(r.exitCode).toBe(0);
    expect(existsSync(stub.sentinel)).toBe(false);
  });

  test("propagates exit 3 when gh repo create fails", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");
    const stub = makeGhStub(root, { exit: 7, stderr: "auth required" });

    const r = runWithStub(root, stub, "--target", target, "--cadence", "standard", "--gh-create", "yes");

    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("gh repo create failed");
    expect(existsSync(join(target, "RAMP.md"))).toBe(true);
  });

  test("gh is NOT invoked when --no-gh is passed", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");
    const stub = makeGhStub(root);

    runWithStub(root, stub, "--target", target, "--cadence", "standard", "--no-gh");

    expect(existsSync(stub.sentinel)).toBe(false);
  });
});
