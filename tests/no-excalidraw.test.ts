import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// The Excalidraw MCP canvas was removed (PR #586). No tracked file may tell
// Claude to use it again. Only history and test evidence may still name it.

const REPO = resolve(import.meta.dir, "..");

const ALLOWED = [
  /^\.gitignore$/, // ignores a leftover log file on old checkouts
  /^docs\/superpowers\//, // dated design history
  /^tests\/results\//, // recorded eval transcripts
  /(^|\/)evals\/evals\.json$/, // eval regexes that only widen a match
  /^tests\/evals-lib\.ts$/, // comment quoting PR #93 history
  /^tests\/no-excalidraw\.test\.ts$/, // this guard
  /^tests\/render-templates\.test\.ts$/, // negative assertions
];

function trackedFiles(): string[] {
  const out = spawnSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8" });
  if (out.status !== 0) throw new Error(`git ls-files failed: ${out.stderr}`);
  return out.stdout.split("\0").filter(Boolean).sort();
}

describe("Excalidraw is gone", () => {
  test("no tracked file outside history and test evidence mentions it", () => {
    const offenders = trackedFiles()
      .filter((f) => !ALLOWED.some((re) => re.test(f)))
      .filter((f) => {
        const text = readFileSync(join(REPO, f), "latin1");
        return /excalidraw|excalifont/i.test(text);
      });
    expect(offenders).toEqual([]);
  });
});
