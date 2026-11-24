import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// macOS mktemp ignores TMPDIR unless it gets an explicit template path. Bare
// `mktemp`, `mktemp -d` and the `-t name` form all write to /var/folders,
// which the Claude Code sandbox blocks, so scripts fail only when Claude runs
// them (#613). Every call must pass a template, and must not use -t.
//
// Test scripts, bin/ scripts and validate.fish must also stop when mktemp
// fails. An empty fixture path made `cd "$dir"` stay in the live repo, and a
// hook test committed its fixture onto the working branch. In fish, an empty
// path also makes `cat $err` read the keyboard, so the script hangs (#618).
// Hooks are left out: they skip their work and exit 0 on purpose.

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
  // -t alone, inside a flag group like -dt, or the long --tmpdir form.
  if (/(^|\s)(-[a-zA-Z]*t|--tmpdir)/.test(args)) {
    return "uses -t, which ignores TMPDIR on macOS";
  }
  if (!args.includes("XXXXXX")) return "has no template path";
  return null;
}

// bash `|| exit 1` or fish `; or exit 1`, placed right after the mktemp
// substitution closes so the exit tests mktemp itself, with a nonzero code.
// A guard block opened on the same line (`|| {`, `; or begin`) also counts,
// for code that must report through its own error path first. A fish
// `if test $status -ne 0` on the next line counts too.
// `local` and `export` return 0 and hide the failure, so they don't count.
function stopsOnFailure(line: string, next = ""): boolean {
  if (/^\s*(local|export)\b/.test(line)) return false;
  const guard = /\bmktemp\b[^)]*\)"?\s*(\|\||;\s*or)\s+(exit\s+[1-9]|\{|begin\b)/;
  return guard.test(line) || /^\s*if test \$status -ne 0\b/.test(next);
}

function mustStop(file: string): boolean {
  return /^(tests|bin)\//.test(file) || file === "validate.fish";
}

function offenders(): string[] {
  const found: string[] = [];
  for (const file of shellScripts()) {
    const lines = readFileSync(join(REPO, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/^\s*#/.test(line)) return;
      // `(?! failed)` skips the "mktemp failed" text in guard error messages.
      for (const m of line.matchAll(/\bmktemp\b(?! failed)([^)\n|;]*)/g)) {
        const why =
          problem(m[1]) ??
          (mustStop(file) && !stopsOnFailure(line, lines[i + 1])
            ? "script doesn't stop when mktemp fails"
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
    expect(problem(" -dt adv-review.XXXXXX")).not.toBeNull();
    expect(problem(" --tmpdir=/x adv.XXXXXX")).not.toBeNull();
    expect(problem(' "$TMPDIR/validate.XXXXXX"')).toBeNull();
    expect(problem(' -d "${TMPDIR:-/tmp}/hook-test.XXXXXX"')).toBeNull();
    expect(problem(' "$settings.XXXXXX"')).toBeNull();
  });

  test("stopsOnFailure() accepts bash and fish exits", () => {
    expect(stopsOnFailure('D=$(mktemp -d "$T/x.XXXXXX") || exit 1')).toBe(true);
    expect(stopsOnFailure('set d (mktemp -d "$T/x.XXXXXX"); or exit 1')).toBe(true);
    expect(stopsOnFailure('D=$(mktemp -d "$T/x.XXXXXX")')).toBe(false);
  });

  test("stopsOnFailure() accepts guard blocks and a status check on the next line", () => {
    expect(stopsOnFailure('set e (mktemp "$T/x.XXXXXX"); or begin; fail "x"; return; end')).toBe(true);
    expect(stopsOnFailure('D=$(mktemp "$T/x.XXXXXX") || { echo x >&2; exit 1; }')).toBe(true);
    expect(stopsOnFailure('set t (mktemp "$T/x.XXXXXX")', "if test $status -ne 0; or not cp a $t")).toBe(true);
    expect(stopsOnFailure('set t (mktemp "$T/x.XXXXXX")', "jq . a > $t")).toBe(false);
  });

  test("mustStop() covers tests/, bin/ and validate.fish, not hooks/", () => {
    expect(mustStop("tests/hooks/x.test.sh")).toBe(true);
    expect(mustStop("bin/regen-anchor-snapshots.fish")).toBe(true);
    expect(mustStop("validate.fish")).toBe(true);
    expect(mustStop("hooks/adversarial-spawn.sh")).toBe(false);
  });

  test("stopsOnFailure() rejects exits that don't guard mktemp", () => {
    // The exit guards cd, and `cd ""` succeeds, so an empty path slips through.
    expect(stopsOnFailure('D=$(mktemp -d "$T/x.XXXXXX"); cd "$D" || exit 1')).toBe(false);
    // `local` and `export` return 0, hiding mktemp's failure.
    expect(stopsOnFailure('local D=$(mktemp -d "$T/x.XXXXXX") || exit 1')).toBe(false);
    expect(stopsOnFailure('export D=$(mktemp -d "$T/x.XXXXXX") || exit 1')).toBe(false);
    // Exiting 0 reports success after doing nothing.
    expect(stopsOnFailure('D=$(mktemp -d "$T/x.XXXXXX") || exit 0')).toBe(false);
  });

  test("every tracked fish and shell script passes a template, and scripts that must stop do", () => {
    expect(offenders()).toEqual([]);
  });
});
