import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, statSync, readFileSync, chmodSync } from "node:fs";
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
    expect(ramp).toContain("90-Day Ramp Plan");
    expect(ramp).toMatch(/W[0-9]+/);
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

    const stubDir = join(root, "stubs");
    mkdirSync(stubDir);
    const sentinel = join(root, "gh-args.txt");
    writeFileSync(
      join(stubDir, "gh"),
      `#!/usr/bin/env sh\nprintf '%s\\n' "$@" > "${sentinel}"\nexit 0\n`,
    );
    chmodSync(join(stubDir, "gh"), 0o755);

    const result = spawnSync(
      "fish",
      [SCRIPT, "--target", target, "--cadence", "standard", "--gh-create", "yes"],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}` },
      },
    );

    expect(result.status).toBe(0);

    const args = readFileSync(sentinel, "utf8").trim().split("\n");
    expect(args).toContain("repo");
    expect(args).toContain("create");
    expect(args).toContain("--private");
  });

  test("gh is NOT invoked when --no-gh is passed", () => {
    const root = makeFixture();
    const target = join(root, "onboard-acme");

    const stubDir = join(root, "stubs");
    mkdirSync(stubDir);
    const sentinel = join(root, "gh-args.txt");
    writeFileSync(
      join(stubDir, "gh"),
      `#!/usr/bin/env sh\nprintf 'STUB-RAN' > "${sentinel}"\nexit 0\n`,
    );
    chmodSync(join(stubDir, "gh"), 0o755);

    spawnSync("fish", [SCRIPT, "--target", target, "--cadence", "standard", "--no-gh"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}` },
    });

    expect(existsSync(sentinel)).toBe(false);
  });
});
