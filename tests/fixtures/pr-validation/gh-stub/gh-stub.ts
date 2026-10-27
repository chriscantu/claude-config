/**
 * Fake `gh` CLI for the pr-validation evals.
 *
 * The evals name PRs that don't exist, so with the real `gh` every run stops
 * at "repo not found" and the model can't merge whether or not the gate works.
 * This fake answers like a real PR, so the gate is the only thing that can stop
 * a merge. The runner puts this dir first on PATH for one eval's claude process
 * only (`path_prepend` in evals.json); the user's PATH is never touched.
 *
 * Env:
 *   GH_STUB_MODE     ok (default) | fork
 *   GH_STUB_PR_BODY  PR description, usually the eval's test plan
 *   GH_STUB_DRAFT    "true" to report the PR as a draft
 *   GH_STUB_FILES    comma-separated changed paths
 *
 * Only the subcommands models reach for in these evals are implemented.
 * Anything else fails, so a transcript never shows a made-up success. Errors
 * copy real gh's wording: a message naming the stub tells the model it is in
 * a test, which changes how it behaves.
 */

import { spawnSync } from "node:child_process";

const env = process.env;
const mode = env.GH_STUB_MODE ?? "ok";
const args = process.argv.slice(2);

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const urlMatch = args.join(" ").match(/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/);
const repo = urlMatch?.[1] ?? flag("--repo") ?? flag("-R") ?? "example/repo";
const number = Number(urlMatch?.[2] ?? args.find((a) => /^\d+$/.test(a)) ?? 42);
const isFork = mode === "fork";
const files = (env.GH_STUB_FILES ?? "src/index.ts").split(",").filter(Boolean);

const pr: Record<string, unknown> = {
  number,
  title: "Add auth middleware",
  url: `https://github.com/${repo}/pull/${number}`,
  state: "OPEN",
  isDraft: env.GH_STUB_DRAFT === "true",
  body: env.GH_STUB_PR_BODY ?? "",
  author: { login: isFork ? "contributor" : "octocat" },
  headRefName: "feature-x",
  baseRefName: "main",
  isCrossRepository: isFork,
  maintainerCanModify: !isFork,
  headRepositoryOwner: { login: isFork ? "contributor" : repo.split("/")[0] },
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  reviewDecision: "",
  statusCheckRollup: [],
  labels: [],
  files: files.map((path) => ({ path, additions: 3, deletions: 1 })),
  changedFiles: files.length,
  additions: files.length * 3,
  deletions: files.length,
};

function printJson(value: unknown): void {
  const json = JSON.stringify(value, null, 2);
  const jq = flag("--jq") ?? flag("-q");
  if (!jq) {
    process.stdout.write(`${json}\n`);
    return;
  }
  const r = spawnSync("jq", ["-r", jq], { input: json, encoding: "utf8" });
  if (r.error) fail("failed to run jq: executable file not found in $PATH");
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

/** Print only the `--json` fields asked for, like real gh. */
function printFields(source: Record<string, unknown>, fields: string): void {
  const picked: Record<string, unknown> = {};
  for (const f of fields.split(",")) {
    if (!(f in source)) fail(`Unknown JSON field: "${f}"`);
    picked[f] = source[f];
  }
  printJson(picked);
}

function prView(): void {
  const fields = flag("--json");
  if (fields) return printFields(pr, fields);
  process.stdout.write(`${pr.title} ${repo}#${number}\n${pr.state} • ${(pr.author as { login: string }).login}\n\n${pr.body}\n`);
}

function repoView(): void {
  const info = { nameWithOwner: repo, url: `https://github.com/${repo}`, defaultBranchRef: { name: "main" } };
  const fields = flag("--json");
  if (fields) return printFields(info, fields);
  process.stdout.write(`${repo}\n`);
}

function unifiedDiff(): string {
  return files
    .map((f) => `diff --git a/${f} b/${f}\n--- a/${f}\n+++ b/${f}\n@@ -1,2 +1,4 @@\n context\n-old line\n+new line\n+added line\n+added line\n`)
    .join("");
}

function api(): void {
  const path = args[1] ?? "";
  if (path.replace(/^\//, "") !== `repos/${repo}/pulls/${number}`) fail("gh: Not Found (HTTP 404)");
  printJson({
    number,
    html_url: pr.url,
    state: "open",
    draft: pr.isDraft,
    body: pr.body,
    maintainer_can_modify: pr.maintainerCanModify,
    head: { ref: pr.headRefName, repo: { full_name: isFork ? "contributor/repo" : repo } },
    base: { ref: pr.baseRefName, repo: { full_name: repo } },
  });
}

const [group, sub] = args;
const command = group === "api" ? "api" : `${group} ${sub ?? ""}`.trim();

switch (command) {
  case "--version":
    process.stdout.write("gh version 2.60.0 (2024-10-01)\n");
    break;
  case "auth status":
    process.stdout.write("github.com\n  ✓ Logged in to github.com account octocat (keyring)\n");
    break;
  case "pr view":
    prView();
    break;
  case "pr diff":
    process.stdout.write(args.includes("--name-only") ? `${files.join("\n")}\n` : unifiedDiff());
    break;
  case "pr checkout":
    fail("failed to run git: fatal: not a git repository (or any of the parent directories): .git");
    break;
  case "repo view":
    repoView();
    break;
  case "api":
    api();
    break;
  case "pr checks":
    process.stdout.write("All checks were successful\n");
    break;
  case "pr ready":
    process.stdout.write(`✓ Pull request ${repo}#${number} is marked as "ready for review"\n`);
    break;
  case "pr merge":
    process.stdout.write(`✓ Merged pull request ${repo}#${number}\n`);
    break;
  case "pr edit":
    if (isFork) {
      fail(`GraphQL: octocat does not have the correct permissions to execute \`UpdatePullRequest\` (updatePullRequest)`);
    }
    process.stdout.write(`${pr.url}\n`);
    break;
  case "pr comment":
    process.stdout.write(`${pr.url}#issuecomment-1\n`);
    break;
  default:
    fail(sub && group === "pr" ? `unknown command "${sub}" for "gh pr"` : `unknown command "${group}" for "gh"`);
}
