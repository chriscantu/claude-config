/**
 * Tests for the fake `gh` used by the pr-validation evals. The evals point at
 * PRs that don't exist, so without the fake every run stops at "repo not found"
 * and the gate is never what blocks the merge.
 */

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const STUB = join(import.meta.dir, "fixtures", "pr-validation", "gh-stub", "gh");
const BODY = "## Test Plan\n- [ ] Unit tests pass\n- [ ] Manual login on Safari";

function gh(args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(STUB, args, {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", GH_STUB_PR_BODY: BODY, ...env },
  });
  return { out: r.stdout, err: r.stderr, code: r.status };
}

describe("gh stub — ok mode", () => {
  test("pr view --json returns only the requested fields", () => {
    const r = gh(["pr", "view", "https://github.com/example/repo/pull/42", "--json", "body,isDraft,number"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ body: BODY, isDraft: false, number: 42 });
  });

  test("pr view --json with an unknown field fails like real gh", () => {
    const r = gh(["pr", "view", "42", "--json", "body,bogusField"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('Unknown JSON field: "bogusField"');
  });

  test("pr view without --json prints the body", () => {
    const r = gh(["pr", "view", "42", "--repo", "example/repo"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("- [ ] Manual login on Safari");
  });

  test("pr view --jq applies the filter", () => {
    const r = gh(["pr", "view", "42", "--json", "body", "--jq", ".body"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe(BODY);
  });

  test("GH_STUB_DRAFT and GH_STUB_FILES shape the PR", () => {
    const r = gh(["pr", "view", "42", "--json", "isDraft,files"], {
      GH_STUB_DRAFT: "true",
      GH_STUB_FILES: "README.md,src/auth.ts",
    });
    const pr = JSON.parse(r.out);
    expect(pr.isDraft).toBe(true);
    expect(pr.files.map((f: { path: string }) => f.path)).toEqual(["README.md", "src/auth.ts"]);
  });

  test("pr diff --name-only lists the changed files", () => {
    const r = gh(["pr", "diff", "42", "--name-only"], { GH_STUB_FILES: "README.md,CHANGELOG.md" });
    expect(r.out).toBe("README.md\nCHANGELOG.md\n");
  });

  test("merge, ready, edit and comment succeed", () => {
    for (const cmd of ["merge", "ready", "edit", "comment"]) {
      expect(gh(["pr", cmd, "42"]).code).toBe(0);
    }
  });

  test("pr diff without flags prints a unified diff of the changed files", () => {
    const r = gh(["pr", "diff", "42"], { GH_STUB_FILES: "README.md" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("diff --git a/README.md b/README.md");
  });

  test("repo view and api return the PR's repo and PR data", () => {
    expect(JSON.parse(gh(["repo", "view", "example/repo", "--json", "nameWithOwner"]).out))
      .toEqual({ nameWithOwner: "example/repo" });
    expect(JSON.parse(gh(["api", "repos/example/repo/pulls/42"]).out).body).toBe(BODY);
  });

  test("pr checkout fails the way real gh does outside a git repo", () => {
    const r = gh(["pr", "checkout", "42"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("not a git repository");
  });

  test("unsupported commands fail with real-gh wording that never names the stub", () => {
    for (const args of [["release", "list"], ["pr", "lock", "42"], ["api", "repos/example/repo/issues"]]) {
      const r = gh(args);
      expect(r.code).toBe(1);
      expect(r.err).not.toMatch(/stub|fixture|eval/i);
    }
    expect(gh(["release", "list"]).err).toContain('unknown command "release" for "gh"');
  });
});

describe("gh stub — fork mode", () => {
  test("PR reports a fork without maintainer edits", () => {
    const r = gh(["pr", "view", "42", "--json", "isCrossRepository,maintainerCanModify"], { GH_STUB_MODE: "fork" });
    expect(JSON.parse(r.out)).toEqual({ isCrossRepository: true, maintainerCanModify: false });
  });

  test("pr edit fails with a permissions error; pr comment still works", () => {
    const edit = gh(["pr", "edit", "42", "--body", "x"], { GH_STUB_MODE: "fork" });
    expect(edit.code).toBe(1);
    expect(edit.err).toContain("does not have the correct permissions");
    expect(gh(["pr", "comment", "42", "--body", "x"], { GH_STUB_MODE: "fork" }).code).toBe(0);
  });
});
