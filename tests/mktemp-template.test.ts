import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// macOS mktemp ignores TMPDIR unless it gets an explicit template path. Bare
// `mktemp`, `mktemp -d` and the `-t name` form all write to /var/folders,
// which the Claude Code sandbox blocks, so scripts fail only when Claude runs
// them (#613). Every call must pass a template, and must not use -t.
//
// Test scripts must also stop when mktemp fails. An empty fixture path made
// `cd "$dir"` stay in the live repo, and a hook test committed its fixture
// onto the working branch.

const REPO = resolve(import.meta.dir, "..");

function shellScripts(): string[] {
  const out = spawnSync("git", ["ls-files", "-z", "*.fish", "*.sh"], {
    cwd: REPO,
    encoding: "utf8",
  });
  if (out.status !== 0) throw new Error(`git ls-files failed: ${out.stderr}`);
  return out.stdout.split("\0").filter(Boolean).sort();
}

// Returns why a mktemp call is unsafe, or null when it passes a template.
function problem(args: string): string | null {
  if (/(^|\s)-t(\s|$)/.test(args)) return "uses -t, which ignores TMPDIR";
  if (!args.includes("XXXXXX")) return "has no template path";
  return null;
}

// bash `|| exit 1` or fish `; or exit 1` on the same line as the mktemp call.
function stopsOnFailure(line: string): boolean {
  return /(\|\||;\s*or)\s+exit\b/.test(line);
}

function offenders(): string[] {
  const found: string[] = [];
  for (const file of shellScripts()) {
    const lines = readFileSync(join(REPO, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/^\s*#/.test(line)) return;
      for (const m of line.matchAll(/\bmktemp\b([^)\n|;]*)/g)) {
        const why =
          problem(m[1]) ??
          (file.startsWith("tests/") && !stopsOnFailure(line)
            ? "test script doesn't exit when mktemp fails"
            : null);
        if (why) found.push(`${file}:${i + 1} ${why}: ${line.trim()}`);
      }
    });
  }
  return found;
}

describe("mktemp calls work inside the sandbox", () => {
  test("problem() flags bare and -t forms, accepts templates", () => {
    expect(problem("")).not.toBeNull();
    expect(problem(" -d")).not.toBeNull();
    expect(problem(" -d -t adv-review.XXXXXX")).not.toBeNull();
    expect(problem(' "$TMPDIR/validate.XXXXXX"')).toBeNull();
    expect(problem(' -d "${TMPDIR:-/tmp}/hook-test.XXXXXX"')).toBeNull();
    expect(problem(' "$settings.XXXXXX"')).toBeNull();
  });

  test("stopsOnFailure() accepts bash and fish exits", () => {
    expect(stopsOnFailure('D=$(mktemp -d "$T/x.XXXXXX") || exit 1')).toBe(true);
    expect(stopsOnFailure('set d (mktemp -d "$T/x.XXXXXX"); or exit 1')).toBe(true);
    expect(stopsOnFailure('D=$(mktemp -d "$T/x.XXXXXX")')).toBe(false);
  });

  test("every tracked fish and shell script passes a template", () => {
    expect(offenders()).toEqual([]);
  });
});
