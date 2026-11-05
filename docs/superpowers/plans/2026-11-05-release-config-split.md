# Release Config Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everyday Claude Code sessions load only claude-config rules merged to GitHub `main`, and eval runs load the branch in the working copy.

**Architecture:** `~/.claude` links point at a detached git worktree of `origin/main` (the *release copy*). A `SessionStart` hook updates that copy in the background. A separate config folder, `~/.claude-eval`, links to the working copy, and the eval tooling runs `claude` with `CLAUDE_CONFIG_DIR` set to it.

**Tech Stack:** fish (`bin/`), bash (`hooks/`, shellcheck 0.8.0-clean), TypeScript on Bun (`tests/`), git worktrees, jq.

**Spec:** `docs/superpowers/specs/2026-11-05-release-config-split-design.md`

## Global Constraints

- Release copy path: `$CLAUDE_CONFIG_RELEASE_DIR`, default `$HOME/.claude-config-release`. Detached at `origin/main`.
- Eval folder path: `$CLAUDE_EVAL_HOME`, default `$HOME/.claude-eval`.
- CI opt-out for the eval folder: `EVAL_ALLOW_DEFAULT_CONFIG=1`. There is no other fallback.
- Updater log: `$HOME/.claude/logs/config-release.jsonl`, written with `hook_log_jsonl` from `hooks/lib/hook-runtime.sh`.
- Updater kill switch: sentinel file `DISABLE_CONFIG_RELEASE_UPDATE`, checked with `hook_disabled`.
- The updater never resets, stashes, or deletes anything in the release copy. It only fast-forwards.
- No network wait on the session-start path. No text added to session context.
- No `A && B || C` in bash (CI shellcheck 0.8.0 flags SC2015).
- Commit messages: imperative subject, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run `bun test tests/`, `bun run typecheck`, `fish validate.fish`, and `for t in tests/hooks/*.test.sh; do bash $t; done` before each commit that touches the matching area.

## Review Focus

1. **GitHub unreachable at session start.** The hook must return at once, and the session must start normally. Tested in Task 2 (`hook returns fast while worker hangs`).
2. **Two sessions start at the same moment.** Only one worker updates at a time, and the other logs `skipped:locked`. Tested in Task 2.
3. **Release copy deleted or never set up.** `link-config` silently linking from the checkout would bring the bug back. It must print a visible note, and the updater must log `skipped:no-release`. Tested in Tasks 1 and 2.
4. **A rule renamed or deleted on `main`.** The old link must be pruned and the new one created with no manual step. Tested in Task 2 (`rename triggers relink`).
5. **Eval folder linked to a different clone** (for example the conductor worktree). The runner must refuse to run, not test the wrong files. Tested in Task 4.

---

### Task 1: `link-config` gets a source root and a target home

**Files:**
- Modify: `bin/lib/symlinks.fish` (add `release_source_root`)
- Modify: `bin/link-config.fish` (flags `--source DIR`, `--home DIR`; default source)
- Modify: `validate.fish` `_phase_1e` (compare against `release_source_root $repo_dir`)
- Test: `tests/link-config.test.ts`, `tests/symlinks-test.fish`

**Interfaces:**
- Produces: `release_source_root CHECKOUT` → prints `$CLAUDE_CONFIG_RELEASE_DIR` (or `$HOME/.claude-config-release`) when that path has a `.git` entry, else prints CHECKOUT. Always exits 0.
- Produces: `fish bin/link-config.fish [--install|--check] [--source DIR] [--home DIR]`. Default `--source` is `release_source_root <this checkout>`. Default `--home` is `$HOME/.claude`. Flags can appear in any order. When the default falls back to the checkout, it prints `NOTE: no release copy at <path>; linking from <checkout>` to stderr.

- [ ] **Step 1: Write the failing tests**

In `tests/symlinks-test.fish`, add:
- `release_source_root` returns the release dir when it contains a `.git` file.
- It returns the checkout when the release dir is missing.

In `tests/link-config.test.ts` (HOME = fixture), add:
- `default source is the release copy when one exists`: `git clone -q --shared REPO <HOME>/.claude-config-release`, run `--install`, then expect `readlinkSync(<HOME>/.claude/CLAUDE.md)` to be `<HOME>/.claude-config-release/global/CLAUDE.md`.
- `default source falls back to the checkout with a NOTE`: no release dir. Expect the link to be `REPO/global/CLAUDE.md` and stderr to match `/^NOTE: no release copy at /m`.
- `--source and --home override defaults`: run `--install --source REPO --home <HOME>/eval`, then expect `<HOME>/eval/CLAUDE.md` to point to `REPO/global/CLAUDE.md` and `<HOME>/.claude` not to exist.
- `--check flags links into the checkout as STALE once a release copy exists`: install with no release dir, clone the release copy, then run `--check`. Expect a non-zero exit and a `STALE link:` line.

- [ ] **Step 2: Run them and confirm they fail**

Run: `fish tests/symlinks-test.fish; bun test tests/link-config.test.ts`
Expected: the new cases FAIL (unknown function, unknown argument `--source`).

- [ ] **Step 3: Implement `release_source_root` and the flags**

Replace `set -l home_claude $HOME/.claude` and the single-argument `switch` with a loop over `$argv`. Pass `$source` everywhere `$repo` is used as a link source, including `each_orphan_symlink`. Keep `$repo` only for `source $repo/bin/lib/symlinks.fish`. Update the header's usage block.

- [ ] **Step 4: Point validate.fish Phase 1e at the same source**

In `_phase_1e`, call `check_symlink_layout (release_source_root $repo_dir) $claude_dir`.

- [ ] **Step 5: Run the tests and validator**

Run: `fish tests/symlinks-test.fish; bun test tests/link-config.test.ts; fish validate.fish`
Expected: all PASS. Phase 1e still passes on this machine, which has no release copy yet.

- [ ] **Step 6: Commit** — `Let link-config link from a release copy into any home`

---

### Task 2: Background release updater hook

**Files:**
- Create: `hooks/config-release-update.sh` (the `SessionStart` hook)
- Create: `hooks/lib/config-release-worker.sh` (the update itself)
- Test: `tests/hooks/config-release-update.test.sh`

**Interfaces:**
- Consumes: `fish <release>/bin/link-config.fish` (Task 1; default mode, no flags, so it links from the release copy into `~/.claude`).
- Produces: hook `hooks/config-release-update.sh`. It reads the event on stdin. It exits 0 always and prints nothing to stdout.
- Produces: worker `hooks/lib/config-release-worker.sh RELEASE_DIR LOG_FILE` exits 0 always and appends one update record.
- Test seams (env): `CONFIG_RELEASE_SYNC=1` runs the worker in the foreground; `CONFIG_RELEASE_WORKER=<cmd>` replaces the worker; `CONFIG_RELEASE_LINK_CMD=<cmd>` replaces the link-config call; `CONFIG_RELEASE_LOG=<file>` replaces the log path.
- Log records (one JSON object per line):
  - Hook: `{"ts":ISO8601,"event":"session","session_id":S,"loaded":SHA|null,"result":"started"|"skipped:no-release"}`
  - Worker: `{"ts":ISO8601,"event":"update","from":SHA,"to":SHA,"result":R}`, where R is one of `updated`, `updated+relinked`, `updated+relinked+needs-registration`, `unchanged`, `skipped:dirty`, `skipped:not-fast-forward`, `skipped:locked`, `fetch-failed`, `relink-failed`.

- [ ] **Step 1: Write the failing tests**

Build each fixture in `$TMP`: a bare `origin.git` with one commit on `main` containing `rules/a.md`, and a release clone checked out with `--detach origin/main`. Mirror the style of `tests/hooks/hook-runtime.test.sh` and use `HOOK_SENTINEL_DIR` for hermetic switches. Cases:
- `logs loaded commit`: SYNC, origin unchanged. The session record's `loaded` is the release HEAD, and the update result is `unchanged`.
- `fast-forwards to origin main`: push a content-only change to `rules/a.md`. The release HEAD becomes the new origin SHA, the result is `updated`, and the link command is NOT run.
- `added file triggers relink`: push a new `rules/b.md`. The result is `updated+relinked`, and the link command ran once.
- `rename triggers relink`: push `git mv rules/a.md rules/c.md`. The result is `updated+relinked`.
- `needs-registration is surfaced`: the link command prints `WARNING: hooks/rules-shadow.sh is not registered` to stderr. The result ends with `+needs-registration`.
- `dirty release is left alone`: modify a tracked file in the release copy. The result is `skipped:dirty`, and HEAD and the file are unchanged.
- `diverged release is left alone`: commit locally in the release copy. The result is `skipped:not-fast-forward`, and HEAD is unchanged.
- `fetch failure changes nothing`: set the origin URL to a missing path. The result is `fetch-failed`, and HEAD is unchanged.
- `lock held`: pre-create the lock dir. The result is `skipped:locked`.
- `stale lock is cleared`: the lock dir has an mtime more than 10 minutes old. The update proceeds.
- `no release copy`: `CLAUDE_CONFIG_RELEASE_DIR` points to a missing path. The hook exits 0, and the session record says `skipped:no-release`.
- `kill switch`: `DISABLE_CONFIG_RELEASE_UPDATE` is present. Nothing is logged, and the exit code is 0.
- `hook returns fast while worker hangs`: `CONFIG_RELEASE_WORKER="sleep 10"`, no SYNC. The hook exits 0 in under 2 seconds.
- `stdout stays empty`: the hook's stdout is empty in every case above, so nothing is added to session context.

- [ ] **Step 2: Run and confirm failure**

Run: `bash tests/hooks/config-release-update.test.sh`
Expected: FAIL (hook file missing).

- [ ] **Step 3: Implement the hook**

Use the `hook-runtime.sh` prelude, so `HOOK_DIR` is resolved with `readlink -f`. Order: kill switch → read input → resolve the release dir → write the session record → start the worker detached (`nohup … >/dev/null 2>&1 &`) unless `CONFIG_RELEASE_SYNC=1`.

- [ ] **Step 4: Implement the worker**

- The lock is `mkdir "$(git -C REL rev-parse --git-dir)/config-release-update.lock"`, removed by `trap` on exit. A lock older than 10 minutes counts as stale.
- The dirty check is `git status --porcelain`.
- The fetch is `git fetch -q origin main`, and it must give up within 30 seconds. Choose how: `GIT_SSH_COMMAND` with `ConnectTimeout`, plus `http.lowSpeedLimit` / `http.lowSpeedTime`.
- The fast-forward check is `git merge-base --is-ancestor HEAD origin/main`. Then move with `git checkout -q --detach origin/main`.
- The relink decision is `git diff --name-only --diff-filter=ADR FROM TO -- rules agents commands skills .claude/skills hooks global` being non-empty.
- Use link-config's **default** mode, not `--install`. Default mode refuses to replace real files, which is safer for an unattended run. The spec said `--install`; this is the one change from it.

- [ ] **Step 5: Run tests and shellcheck**

Run: `bash tests/hooks/config-release-update.test.sh && shellcheck hooks/config-release-update.sh hooks/lib/config-release-worker.sh`
Expected: all PASS, no shellcheck findings.

- [ ] **Step 6: Commit** — `Add a session-start hook that fast-forwards the release copy`

---

### Task 3: Eval config folder setup

**Files:**
- Create: `bin/lib/eval-home.fish`
- Create: `bin/setup-eval-home.fish`
- Test: `tests/setup-eval-home.test.ts`

**Interfaces:**
- Consumes: `link-config.fish --source DIR --home DIR` (Task 1).
- Produces: `eval_home_dir` (fish function in `bin/lib/eval-home.fish`) → prints `$CLAUDE_EVAL_HOME` or `$HOME/.claude-eval`.
- Produces: `fish bin/setup-eval-home.fish [--no-auth-check]`. It is idempotent and exits 0 on success, 1 when the login check fails, and 2 on setup errors. Steps, in order:
  1. Link the checkout into the eval folder: `link-config.fish --source <this checkout> --home (eval_home_dir)`.
  2. Make `<eval>/plugins` a symlink to `$HOME/.claude/plugins`. A real directory already there is moved to `plugins.bak` once. If `plugins.bak` already exists, exit 2.
  3. Write `<eval>/settings.json` from `$HOME/.claude/settings.json` with jq. Every hook `command` that starts with `$HOME/.claude/hooks/` gets that prefix replaced by `<eval>/hooks/`. Every hook entry whose command ends in `config-release-update.sh` is removed, and any matcher group left empty is removed too.
  4. If `$HOME/.claude/rules/first-run-personalization.md` exists, symlink it into `<eval>/rules/`.
  5. Unless `--no-auth-check`: `env -u ANTHROPIC_API_KEY CLAUDE_CONFIG_DIR=<eval> claude auth status` must report `"loggedIn": true`. If not, print `Run: env CLAUDE_CONFIG_DIR=<eval> claude auth login` and exit 1.

- [ ] **Step 1: Write the failing tests** (HOME = fixture with a fake `.claude/settings.json` that has a `PreToolUse` hook at `<HOME>/.claude/hooks/x.sh` and a `SessionStart` hook at `<HOME>/.claude/hooks/config-release-update.sh`, plus a `.claude/plugins/` dir)
- `links the checkout into the eval folder`: `<HOME>/.claude-eval/CLAUDE.md` points to `REPO/global/CLAUDE.md`.
- `rewrites hook paths to the eval folder`: the generated `PreToolUse` command is `<HOME>/.claude-eval/hooks/x.sh`.
- `drops the release updater`: the generated settings have no `SessionStart` key.
- `links plugins`: `<HOME>/.claude-eval/plugins` is a symlink to `<HOME>/.claude/plugins`.
- `backs up a real plugins dir once`: a pre-existing real `plugins/` ends up at `plugins.bak`, and a second run exits 0.
- `CLAUDE_EVAL_HOME overrides the path`.

- [ ] **Step 2: Run and confirm failure** — `bun test tests/setup-eval-home.test.ts` → FAIL (script missing).

- [ ] **Step 3: Implement `bin/lib/eval-home.fish` and `bin/setup-eval-home.fish`**

- [ ] **Step 4: Run tests** — `bun test tests/setup-eval-home.test.ts` → PASS.

- [ ] **Step 5: Commit** — `Add setup for the eval config folder`

---

### Task 4: Eval tooling runs against the eval folder

**Files:**
- Create: `tests/eval-config.ts`
- Modify: `tests/eval-runner-v2.ts` (`CLI_CHILD_ENV`, check in `main` before the pre-flight)
- Modify: `bin/redgreen.fish` (live link path, header comments)
- Modify: `bin/verify-rule-loaded.fish` (spawn with `CLAUDE_CONFIG_DIR`)
- Modify: `.github/workflows/behavioral-evals.yml` (add `EVAL_ALLOW_DEFAULT_CONFIG: "1"` to the eval step's `env`)
- Test: `tests/eval-config.test.ts`, `tests/eval-runner-v2.test.ts`, `tests/verify-rule-loaded.test.ts`

**Interfaces:**
- Consumes: `eval_home_dir` (Task 3) in both fish scripts.
- Produces: `export function evalConfigEnv(env: NodeJS.ProcessEnv, home: string, repoDir: string): { CLAUDE_CONFIG_DIR?: string }`. It throws `EvalConfigError` (exported, `message` names the fix) when the folder is unusable.
  - Returns `{}` when `env.EVAL_ALLOW_DEFAULT_CONFIG === "1"`.
  - Otherwise `dir = env.CLAUDE_EVAL_HOME ?? join(home, ".claude-eval")`. It requires `readlinkSync(join(dir, "CLAUDE.md")) === join(repoDir, "global", "CLAUDE.md")`. If missing or different, it throws with `Run: fish bin/setup-eval-home.fish`.

- [ ] **Step 1: Write the failing tests**
- `eval-config.test.ts`:
  - It returns `{ CLAUDE_CONFIG_DIR: dir }` for a correctly linked fixture.
  - It throws `EvalConfigError` when the folder is missing.
  - It throws when `CLAUDE.md` points into a different directory (the Review Focus 5 case).
  - It returns `{}` with `EVAL_ALLOW_DEFAULT_CONFIG=1`.
- `eval-runner-v2.test.ts`: extend the existing fake-claude test, which records the env the child sees, to also record `CLAUDE_CONFIG_DIR`. Expect it to equal the fixture eval dir. Add a case where a missing eval folder makes the runner exit 1 with stderr matching `/setup-eval-home/`.
- `verify-rule-loaded.test.ts`: the fake claude sees `CLAUDE_CONFIG_DIR` equal to `CLAUDE_EVAL_HOME`.

- [ ] **Step 2: Run and confirm failure** — `bun test tests/eval-config.test.ts tests/eval-runner-v2.test.ts tests/verify-rule-loaded.test.ts` → FAIL.

- [ ] **Step 3: Implement `tests/eval-config.ts` and wire it into the runner**

Merge `evalConfigEnv(...)` into `CLI_CHILD_ENV`, so every turn and the auth pre-flight use the eval login. Call it in `main` before the MCP and auth pre-flights. On `EvalConfigError`, print in red and `process.exit(1)`. When `EVAL_ALLOW_DEFAULT_CONFIG=1`, print a yellow banner the way `EVAL_SKIP_AUTH_PROBE` does.

- [ ] **Step 4: Update `bin/redgreen.fish`**

Set `__rg_live_link` to `(eval_home_dir)/rules/$rule_name.md`. The not-a-symlink error now says `run fish bin/setup-eval-home.fish`. Remove the "stripped from ~/.claude for ALL sessions" caveat and the matching restore comment. Replace them with one line: everyday sessions are unaffected, because only the eval folder is touched.

- [ ] **Step 5: Update `bin/verify-rule-loaded.fish`** to spawn `claude` with `CLAUDE_CONFIG_DIR=(eval_home_dir)` and `env -u ANTHROPIC_API_KEY`. Update its header: it checks that a rule loads from the working copy through the eval folder.

- [ ] **Step 6: Add the CI opt-out** to `behavioral-evals.yml`.

- [ ] **Step 7: Run all tests and the type check** — `bun test tests/ && bun run typecheck` → PASS.

- [ ] **Step 8: Commit** — `Run evals and redgreen against the eval config folder`

---

### Task 5: Release setup, install path, and docs

**Files:**
- Create: `bin/setup-release.fish`
- Modify: `install.fish`
- Modify: `README.md` (install section) and `docs/operations.md` (eval login section)
- Test: `tests/setup-release.test.ts`

**Interfaces:**
- Consumes: `link-config.fish` (Task 1), `setup-eval-home.fish` (Task 3), `hooks/config-release-update.sh` (Task 2).
- Produces: `fish bin/setup-release.fish [--repo DIR]`. It is idempotent, and `--repo` defaults to this checkout. Steps:
  1. `git -C REPO fetch -q origin main`.
  2. If the release dir has no `.git`: `git -C REPO worktree add --detach <release> origin/main`. If the dir exists but isn't a git checkout, exit 2.
  3. `fish <release>/bin/link-config.fish`.
  4. Register the hook in `$HOME/.claude/settings.json` (or `FIRST_RUN_SETTINGS_PATH` when set): a `SessionStart` entry `{type:"command", command:"$HOME/.claude/hooks/config-release-update.sh", timeout:5}`. Back up first to `settings.json.bak.<UTC timestamp>`, using `first-run.fish`'s naming. Skip if an entry already runs that file. Refuse to touch invalid JSON.
- `install.fish`: replace the direct `link-config.fish --install` with `setup-release.fish`, then `setup-eval-home.fish`. Keep the first-run hint.

- [ ] **Step 1: Write the failing tests** (HOME = fixture; `--repo` = a `git clone -q --shared REPO` fixture, so the real repo's worktree list is never touched)
- `creates a detached release copy at origin/main`: `git -C <rel> rev-parse HEAD` equals the fixture's `origin/main`, and `git -C <rel> symbolic-ref -q HEAD` fails (detached).
- `links ~/.claude to the release copy`: `<HOME>/.claude/CLAUDE.md` points to `<rel>/global/CLAUDE.md`.
- `registers the SessionStart hook once`: run twice, and `jq '[.hooks.SessionStart[].hooks[] | select(.command|endswith("config-release-update.sh"))] | length'` is `1`.
- `refuses a non-git release dir`: exit 2, and the dir is unchanged.

- [ ] **Step 2: Run and confirm failure** — `bun test tests/setup-release.test.ts` → FAIL.

- [ ] **Step 3: Implement `bin/setup-release.fish` and update `install.fish`**

- [ ] **Step 4: Run tests** — `bun test tests/setup-release.test.ts` → PASS.

- [ ] **Step 5: Find out which skill copy wins inside this repo**

In a scratch clone, make `.claude/skills/tdd/SKILL.md` and the release copy's version differ by a probe line. Ask a `claude --print` session in the clone which probe it sees. Record the answer for the docs.

- [ ] **Step 6: Write the docs**

Write for a newcomer, in short sentences. Cover:
- what the release copy and eval folder are, and why they exist
- that merges reach sessions on the second new session
- how to try a branch interactively: `env CLAUDE_CONFIG_DIR=$HOME/.claude-eval claude`
- how to redo the eval login
- the manual `settings.json` registration limit
- the Step 5 finding
- how to undo: `fish bin/link-config.fish --source <checkout>`
- the kill switch

- [ ] **Step 7: Run the full checks** — `bun test tests/ && bun run typecheck && fish validate.fish` → PASS.

- [ ] **Step 8: Commit** — `Install through a release copy and document the split`

---

### Task 6: Cut over this machine and prove the outcome

This changes the live config on this Mac. Each step's check is the spec's "How we'll know it worked". Record the outputs in the PR test plan.

- [ ] **Step 1: Set up** — `fish bin/setup-release.fish && fish bin/setup-eval-home.fish`
Expected: exit 0. `readlink ~/.claude/CLAUDE.md` → `~/.claude-config-release/global/CLAUDE.md`, and `fish bin/link-config.fish --check` → exit 0.

- [ ] **Step 2: Branch edits stay out of everyday sessions**
Append `When asked for the probe word, answer exactly: BRANCH-LYNX` to `rules/tdd-pragmatic.md` in the working copy, uncommitted. From `/private/tmp`:
`claude --print "What is the probe word? Reply with only the word, or NONE." < /dev/null` → `NONE`.
`env -u ANTHROPIC_API_KEY CLAUDE_CONFIG_DIR=$HOME/.claude-eval claude --print "…same…" < /dev/null` → `BRANCH-LYNX`.
Then revert the line, and `git diff --quiet rules/` → exit 0.

- [ ] **Step 3: A merge arrives with no manual step**
Run `git -C ~/.claude-config-release checkout -q --detach origin/main~1`. Then start session A with `claude --print "ok" < /dev/null`.
Expected: the last two log lines are a `session` record with `loaded` = `origin/main~1`, and an `update` record with `result` starting with `updated`. Afterwards `git -C ~/.claude-config-release rev-parse HEAD` = `origin/main`. Start session B: its `session` record has `loaded` = `origin/main`.

- [ ] **Step 4: Eval stripping stays in the eval folder**
Run `fish bin/redgreen.fish disagreement --dry-run --green 1 --red 1`. While the RED phase runs, `readlink ~/.claude/rules/disagreement.md` still points into the release copy, and `readlink ~/.claude-eval/rules/disagreement.md` points at the stripped copy.
Expected: exit 0, and `~/.claude/rules` is unchanged throughout.

- [ ] **Step 5: Full checks** — `bun test tests/ && bun run typecheck && fish validate.fish && for t in tests/hooks/*.test.sh; do bash $t || exit 1; done` → exit 0.
