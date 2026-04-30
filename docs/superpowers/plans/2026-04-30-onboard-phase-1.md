# /onboard Skill — Phase 1 Implementation Plan (Scaffolder MVP)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/onboard <org>` skill that scaffolds a per-org git-isolated workspace on day 0 with directory tree, `.gitignore`, `RAMP.md` from a chosen cadence preset, stakeholder seed file, and an auto-prompted private GitHub remote.

**Architecture:** Skill body in `skills/onboard/SKILL.md` orchestrates a fish helper at `bin/onboard-scaffold.fish` that performs all filesystem + git + `gh` operations. Tests are TypeScript (`bun:test`) that spawn the fish script against `mkdtempSync` fixtures, matching the established pattern in `tests/link-config.test.ts`. Phase 1 ships a working day-0 scaffolder; cadence nags (Phase 2), confidentiality enforcement (Phase 3), Calendar integration (Phase 4), and graduation (Phase 5) follow in separate plans.

**Tech Stack:** fish shell (skill helper), TypeScript + `bun:test` (tests), `gh` CLI (private repo creation), git.

**Spec:** [docs/superpowers/specs/2026-04-30-onboard-design.md](../specs/2026-04-30-onboard-design.md) (committed `cd5c530`).

**Issue:** [#12](https://github.com/cantucodemo/claude-config/issues/12).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `skills/onboard/SKILL.md` | new | Frontmatter + skill body. Dispatch logic: prompt cadence, capture manager-handoff, invoke `bin/onboard-scaffold.fish`. Links to reference docs on demand. |
| `skills/onboard/scaffold.md` | new | Reference doc detailing the scaffold flow, dir layout, `.gitignore` contents. Read on demand. |
| `skills/onboard/ramp-template.md` | new | Reference doc with the three cadence preset templates (aggressive / standard / relaxed) for `RAMP.md`. |
| `skills/onboard/manager-handoff.md` | new | Reference doc with the manager-handoff capture prompts (org chart, top-10, key partners). |
| `bin/onboard-scaffold.fish` | new | Fish helper: validates target, creates dir tree, writes `.gitignore`, writes `RAMP.md`, writes `stakeholders/map.md`, runs `git init` + initial commit, optionally `gh repo create --private`. Idempotent re-run is a hard error (refuses to overwrite). |
| `tests/onboard-scaffold.test.ts` | new | `bun:test` suite against the fish helper, using `mkdtempSync` fixtures + `gh` stub via `PATH` injection. |
| `~/.claude/skills/onboard` | new symlink | Created by `bin/link-config.fish` on the user's machine. Test asserts that `bin/link-config.fish --check` passes after the new skill lands. |

Phase 1 introduces zero modifications to existing files except the symlink that `link-config.fish --check` enumerates.

---

## Task 1 — Scaffold the skill via `bin/new-skill`

**Files:**
- Create: `skills/onboard/SKILL.md` (overwritten in later tasks)

- [ ] **Step 1: Run the existing scaffolder**

```fish
bin/new-skill onboard
```

Expected: `skills/onboard/SKILL.md` created from `templates/skill/`. `fish validate.fish` is run automatically by `new-skill`; expect it to pass on the unmodified template.

- [ ] **Step 2: Verify the scaffold landed**

```fish
ls skills/onboard/
test -f skills/onboard/SKILL.md && echo OK
```

Expected: SKILL.md present.

- [ ] **Step 3: Commit the scaffold**

```fish
git add skills/onboard/
git commit -m "Scaffold /onboard skill from template (#12)"
```

---

## Task 2 — Write the failing test for `bin/onboard-scaffold.fish` "refuses to clobber"

**Files:**
- Create: `tests/onboard-scaffold.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/onboard-scaffold.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
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
});
```

- [ ] **Step 2: Run test, confirm it fails**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: FAIL — "ENOENT" or "no such file" on the missing `bin/onboard-scaffold.fish`.

- [ ] **Step 3: Commit the failing test**

```fish
git add tests/onboard-scaffold.test.ts
git commit -m "Add failing test for onboard-scaffold clobber-refusal (#12)"
```

---

## Task 3 — Minimal `bin/onboard-scaffold.fish` skeleton + arg parser

**Files:**
- Create: `bin/onboard-scaffold.fish`

- [ ] **Step 1: Write the script**

```fish
#!/usr/bin/env fish
# Scaffold a per-org onboarding workspace.
#
# Usage:
#   bin/onboard-scaffold.fish --target <path> --cadence <preset> [--no-gh]
#
# --target   absolute path to the workspace dir (must not exist or be empty)
# --cadence  aggressive | standard | relaxed
# --no-gh    skip the `gh repo create --private` prompt (used by tests)

set -l target ""
set -l cadence "standard"
set -l skip_gh 0

set -l i 1
while test $i -le (count $argv)
    set -l arg $argv[$i]
    switch $arg
        case --target
            set i (math $i + 1)
            set target $argv[$i]
        case --cadence
            set i (math $i + 1)
            set cadence $argv[$i]
        case --no-gh
            set skip_gh 1
        case '*'
            echo "unknown arg: $arg" >&2
            exit 2
    end
    set i (math $i + 1)
end

if test -z "$target"
    echo "missing --target" >&2
    exit 2
end

# Refuse to clobber: target must not exist, OR exist and be empty.
if test -e $target
    set -l contents (ls -A $target 2>/dev/null)
    if test -n "$contents"
        echo "refusing to scaffold: $target already has contents" >&2
        exit 1
    end
end

# Body filled in subsequent tasks.
mkdir -p $target
exit 0
```

- [ ] **Step 2: Make it executable**

```fish
chmod +x bin/onboard-scaffold.fish
```

- [ ] **Step 3: Run the test, confirm it passes**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: PASS — clobber-refusal test passes.

- [ ] **Step 4: Commit**

```fish
git add bin/onboard-scaffold.fish
git commit -m "Add bin/onboard-scaffold.fish skeleton with clobber-refusal (#12)"
```

---

## Task 4 — Add subdir tree creation (failing test → impl)

**Files:**
- Modify: `tests/onboard-scaffold.test.ts`
- Modify: `bin/onboard-scaffold.fish`

- [ ] **Step 1: Add the failing test**

Append to `describe("bin/onboard-scaffold.fish", ...)` in `tests/onboard-scaffold.test.ts`:

```typescript
import { existsSync, statSync } from "node:fs";

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
```

- [ ] **Step 2: Run test, confirm it fails**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: FAIL on first missing subdir.

- [ ] **Step 3: Implement subdir creation**

In `bin/onboard-scaffold.fish`, replace the placeholder `mkdir -p $target` line with:

```fish
mkdir -p $target
mkdir -p $target/stakeholders
mkdir -p $target/interviews/raw
mkdir -p $target/interviews/sanitized
mkdir -p $target/swot
mkdir -p $target/decks/slidev
mkdir -p $target/decisions
```

- [ ] **Step 4: Run test, confirm it passes**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```fish
git add tests/onboard-scaffold.test.ts bin/onboard-scaffold.fish
git commit -m "onboard-scaffold: create per-org dir tree (#12)"
```

---

## Task 5 — `.gitignore` content (failing test → impl)

**Files:**
- Modify: `tests/onboard-scaffold.test.ts`
- Modify: `bin/onboard-scaffold.fish`

- [ ] **Step 1: Add the failing test**

Append to `describe(...)`:

```typescript
import { readFileSync } from "node:fs";

test("writes a .gitignore that excludes raw notes and secrets", () => {
  const root = makeFixture();
  const target = join(root, "onboard-acme");

  runScaffold(root, "--target", target, "--cadence", "standard", "--no-gh");

  const gi = readFileSync(join(target, ".gitignore"), "utf8");
  expect(gi).toContain("interviews/raw/");
  expect(gi).toContain(".env");
  expect(gi).toContain("**/private/");
});
```

- [ ] **Step 2: Run test, confirm it fails**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: FAIL — ENOENT on `.gitignore`.

- [ ] **Step 3: Implement `.gitignore` write**

Append to `bin/onboard-scaffold.fish` after the subdir block:

```fish
echo "# /onboard workspace gitignore — protect verbatim interview notes and secrets

interviews/raw/
.env
**/private/
" > $target/.gitignore
```

- [ ] **Step 4: Run test, confirm it passes**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```fish
git add tests/onboard-scaffold.test.ts bin/onboard-scaffold.fish
git commit -m "onboard-scaffold: write protective .gitignore (#12)"
```

---

## Task 6 — `git init` + initial commit (failing test → impl)

**Files:**
- Modify: `tests/onboard-scaffold.test.ts`
- Modify: `bin/onboard-scaffold.fish`

- [ ] **Step 1: Add the failing test**

Append to `describe(...)`:

```typescript
test("runs git init and creates an initial commit on main", () => {
  const root = makeFixture();
  const target = join(root, "onboard-acme");

  runScaffold(root, "--target", target, "--cadence", "standard", "--no-gh");

  expect(existsSync(join(target, ".git"))).toBe(true);

  const log = spawnSync("git", ["-C", target, "log", "--oneline"], { encoding: "utf8" });
  expect(log.status).toBe(0);
  expect(log.stdout.trim().length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test, confirm it fails**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: FAIL — `.git` missing.

- [ ] **Step 3: Implement `git init` + initial commit**

Append to `bin/onboard-scaffold.fish`:

```fish
git -C $target init -q -b main
git -C $target add .
git -C $target commit -q -m "Scaffold /onboard workspace"
```

- [ ] **Step 4: Run test, confirm it passes**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```fish
git add tests/onboard-scaffold.test.ts bin/onboard-scaffold.fish
git commit -m "onboard-scaffold: git init and initial commit (#12)"
```

---

## Task 7 — `RAMP.md` generation from cadence preset (failing test → impl)

**Files:**
- Create: `skills/onboard/ramp-template.md`
- Modify: `tests/onboard-scaffold.test.ts`
- Modify: `bin/onboard-scaffold.fish`

- [ ] **Step 1: Write `skills/onboard/ramp-template.md`**

```markdown
# RAMP Template Reference

Three cadence presets. Each section is the literal `RAMP.md` body the scaffold writes
based on the `--cadence` flag.

## standard

```
# 90-Day Ramp Plan — <org>

Cadence: standard
Started: <YYYY-MM-DD>

| Week | Milestone | Status |
|---|---|---|
| W0 | Workspace scaffolded; manager-handoff captured | [ ] |
| W2 | Stakeholder map ≥80% | [ ] |
| W4 | ≥8 interviews logged + INTERIM reflect-back deck | [ ] |
| W6 | SWOT v1 draft committed | [ ] |
| W8 | FINAL reflect-back deck delivered | [ ] |
| W10 | Quick-win candidate locked | [ ] |
| W13 | Quick-win shipped → graduate | [ ] |

## Cadence Mutes

(none)

## Notes

(scratch space)
```

## aggressive

(same shape as standard, with weeks compressed: W0 / W1 / W3 / W4 / W6 / W7 / W9)

## relaxed

(same shape as standard, with weeks extended: W0 / W3 / W5 / W8 / W10 / W13 / W17)
```

- [ ] **Step 2: Add the failing test**

Append to `tests/onboard-scaffold.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run tests, confirm they fail**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: FAIL — `RAMP.md` missing AND no validation of cadence value.

- [ ] **Step 4: Implement cadence validation + `RAMP.md` write**

In `bin/onboard-scaffold.fish`, immediately after the arg-parse block (before the clobber check), add:

```fish
if not contains $cadence aggressive standard relaxed
    echo "unknown cadence: $cadence (allowed: aggressive | standard | relaxed)" >&2
    exit 2
end
```

After the `git -C $target init` block, add the `RAMP.md` write. For brevity in the
plan, the three cadence weeks are inline; in real implementation factor into a helper
function or a heredoc-equivalent (fish lacks heredocs — use `printf` per CLAUDE.md):

```fish
set -l org_name (basename $target | sed -E 's/^onboard-//')
set -l today (date +%Y-%m-%d)

set -l weeks_standard "W0|W2|W4|W6|W8|W10|W13"
set -l weeks_aggressive "W0|W1|W3|W4|W6|W7|W9"
set -l weeks_relaxed "W0|W3|W5|W8|W10|W13|W17"

set -l weeks ""
switch $cadence
    case aggressive
        set weeks $weeks_aggressive
    case standard
        set weeks $weeks_standard
    case relaxed
        set weeks $weeks_relaxed
end

set -l w (string split "|" $weeks)

printf "# 90-Day Ramp Plan — %s\n\nCadence: %s\nStarted: %s\n\n| Week | Milestone | Status |\n|---|---|---|\n| %s | Workspace scaffolded; manager-handoff captured | [ ] |\n| %s | Stakeholder map >=80%% | [ ] |\n| %s | >=8 interviews logged + INTERIM reflect-back deck | [ ] |\n| %s | SWOT v1 draft committed | [ ] |\n| %s | FINAL reflect-back deck delivered | [ ] |\n| %s | Quick-win candidate locked | [ ] |\n| %s | Quick-win shipped -> graduate | [ ] |\n\n## Cadence Mutes\n\n(none)\n\n## Notes\n\n(scratch space)\n" \
  $org_name $cadence $today $w[1] $w[2] $w[3] $w[4] $w[5] $w[6] $w[7] > $target/RAMP.md
```

(Note: place the `RAMP.md` write BEFORE `git add .` in Task 6's block — the initial commit must include it. Reorder if needed.)

- [ ] **Step 5: Run tests, confirm they pass**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: PASS for both tests.

- [ ] **Step 6: Commit**

```fish
git add skills/onboard/ramp-template.md tests/onboard-scaffold.test.ts bin/onboard-scaffold.fish
git commit -m "onboard-scaffold: write RAMP.md from cadence preset (#12)"
```

---

## Task 8 — `stakeholders/map.md` seed file (failing test → impl)

**Files:**
- Modify: `tests/onboard-scaffold.test.ts`
- Modify: `bin/onboard-scaffold.fish`

- [ ] **Step 1: Add the failing test**

```typescript
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
```

- [ ] **Step 2: Run test, confirm it fails**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: FAIL — `stakeholders/map.md` missing.

- [ ] **Step 3: Implement seed file write**

Append to `bin/onboard-scaffold.fish` (before `git -C $target add .`):

```fish
printf "# Stakeholder Map — %s\n\nPopulated by /stakeholder-map. Manager-handoff seed below.\n\n## Direct reports\n\n(none yet)\n\n## Cross-functional partners\n\n(none yet)\n\n## Skip-level + leadership\n\n(none yet)\n\n## Influencers\n\n(none yet)\n" $org_name > $target/stakeholders/map.md
```

- [ ] **Step 4: Run test, confirm it passes**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```fish
git add tests/onboard-scaffold.test.ts bin/onboard-scaffold.fish
git commit -m "onboard-scaffold: seed stakeholders/map.md (#12)"
```

---

## Task 9 — `gh repo create --private` auto-prompt (with stub-friendly flag)

**Files:**
- Modify: `tests/onboard-scaffold.test.ts`
- Modify: `bin/onboard-scaffold.fish`

The skill prompts the user from the SKILL.md side. The fish helper accepts an explicit `--gh-create yes|no` flag (defaulting to `no` when called from the skill body without user consent, and `yes` when the user agrees). `--no-gh` from earlier tasks remains a hard skip for tests.

- [ ] **Step 1: Add the failing test (gh stub via PATH)**

```typescript
import { writeFileSync, chmodSync, mkdirSync } from "node:fs";

test("gh repo create is invoked when --gh-create yes is passed", () => {
  const root = makeFixture();
  const target = join(root, "onboard-acme");

  // Stub `gh` on PATH that records its argv to a sentinel file and exits 0.
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
```

- [ ] **Step 2: Run tests, confirm they fail**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: FAIL on the first test (no `gh` invocation yet).

- [ ] **Step 3: Implement `gh repo create` invocation**

In `bin/onboard-scaffold.fish`, extend the arg parser to accept `--gh-create yes|no` and the trailing block to invoke `gh`:

Add to the `switch $arg` block:

```fish
case --gh-create
    set i (math $i + 1)
    set gh_create $argv[$i]
```

Add at top of the file (with other defaults):

```fish
set -l gh_create "no"
```

Append after the initial `git commit`:

```fish
if test $skip_gh -eq 0; and test "$gh_create" = "yes"
    set -l repo_name (basename $target)
    gh repo create $repo_name --private --source=$target --remote=origin --push
end
```

- [ ] **Step 4: Run tests, confirm they pass**

```fish
bun test tests/onboard-scaffold.test.ts
```

Expected: PASS for both gh tests.

- [ ] **Step 5: Commit**

```fish
git add tests/onboard-scaffold.test.ts bin/onboard-scaffold.fish
git commit -m "onboard-scaffold: optional gh repo create --private (#12)"
```

---

## Task 10 — Wire `skills/onboard/SKILL.md` body + reference docs

**Files:**
- Modify: `skills/onboard/SKILL.md`
- Create: `skills/onboard/scaffold.md`
- Create: `skills/onboard/manager-handoff.md`

- [ ] **Step 1: Write `skills/onboard/SKILL.md`**

```markdown
---
name: onboard
description: Use when the user says /onboard <org>, "scaffold a new ramp", "set up onboarding workspace for <org>", or starts a new senior eng leader role. Day-0 scaffolder for a per-org ramp workspace; Phase 1 only — cadence nags, confidentiality enforcement, Calendar integration, and graduation ship in later phases.
disable-model-invocation: true
---

# /onboard — Senior Eng Leader 90-Day Ramp Orchestrator

Phase 1 (this implementation): scaffolds a per-org git-isolated workspace at
`~/repos/onboard-<org>/` with the canonical directory tree, `.gitignore`,
`RAMP.md` from a chosen cadence preset, stakeholder seed file, and an
auto-prompted private GitHub remote.

**Announce:** "I'm using the onboard skill to scaffold your <org> ramp workspace."

## Reference docs (read on demand)

- [scaffold.md](scaffold.md) — dir layout, .gitignore contents, scaffold flow
- [ramp-template.md](ramp-template.md) — RAMP.md preset templates
- [manager-handoff.md](manager-handoff.md) — manager-handoff capture prompts

## Invocation flow

1. Confirm the org slug. Default to a kebab-case form of the org name.
2. Confirm the workspace target path. Default `~/repos/onboard-<slug>/`.
3. Ask the cadence preset:

   > Pick cadence: aggressive | **standard** | relaxed

4. Ask whether to create a private GitHub remote:

   > Create a private GitHub repo for this ramp now? Y/N (default Y)

5. Run `bin/onboard-scaffold.fish --target <path> --cadence <preset> --gh-create yes|no`.
6. Capture manager-handoff inputs (see [manager-handoff.md](manager-handoff.md))
   directly into `<target>/stakeholders/map.md` via the section prompts there.
7. Print next-step guidance:

   > Workspace ready at <path>. Next: invoke /stakeholder-map to flesh out the seed
   > and /1on1-prep when you book your first interview.

## What Phase 1 deliberately does NOT do

- Schedule milestone or activity-velocity nags (Phase 2)
- Enforce the raw → sanitized confidentiality boundary at downstream-skill read time
  (Phase 3 — directory layout and .gitignore are in place but the read-refusal logic
  in /swot and /present is wired up later)
- Calendar API integration (Phase 4)
- `--graduate` retro + archive (Phase 5)
```

- [ ] **Step 2: Write `skills/onboard/scaffold.md`**

```markdown
# Scaffold Reference

`bin/onboard-scaffold.fish` is the canonical helper. The skill body invokes it; the
script does NOT prompt the user — all prompts happen in SKILL.md and are passed as
flags.

## Directory layout

(See spec section "Workspace Layout" — duplicated here for on-demand readers.)

## .gitignore contents

(Authoritative content lives in the script itself; do NOT restate here to avoid
canonical-string drift per validate.fish Phase 1g.)

## Flags

| Flag | Required | Values | Notes |
|---|---|---|---|
| `--target` | yes | absolute path | Must not exist or must be empty |
| `--cadence` | yes | `aggressive` / `standard` / `relaxed` | |
| `--gh-create` | no | `yes` / `no` | Default `no` |
| `--no-gh` | no | (boolean) | Hard skip for tests |
```

- [ ] **Step 3: Write `skills/onboard/manager-handoff.md`**

```markdown
# Manager-Handoff Capture

Run this immediately after `bin/onboard-scaffold.fish` returns 0. The seed file at
`<target>/stakeholders/map.md` already has the four canonical section headers.

Ask the user (one section at a time):

1. **Direct reports** — names + roles. Append under `## Direct reports`.
2. **Cross-functional partners** — product, design, data, security counterparts. Append under `## Cross-functional partners`.
3. **Skip-level + leadership** — your manager, their manager, exec sponsor. Append under `## Skip-level + leadership`.
4. **Influencers** — anyone the manager flagged as "you should meet" who isn't above. Append under `## Influencers`.

Capture verbatim names + 1-line roles. Do NOT capture candid commentary here — that
belongs in `/1on1-prep` raw notes.

After capture, commit:

```fish
git -C <target> add stakeholders/map.md
git -C <target> commit -m "Seed stakeholder map from manager handoff"
```
```

- [ ] **Step 4: Validate skill loads**

```fish
fish validate.fish
```

Expected: PASS — the new skill passes structural checks (frontmatter, reference doc presence, etc.).

- [ ] **Step 5: Commit**

```fish
git add skills/onboard/
git commit -m "Wire /onboard SKILL.md body + reference docs (#12)"
```

---

## Task 11 — Symlink registration via `bin/link-config.fish`

**Files:**
- No source changes — verifying the existing installer picks up the new skill.

- [ ] **Step 1: Run check before install**

```fish
bin/link-config.fish --check
```

Expected: report missing symlink for `~/.claude/skills/onboard` (assuming user has not yet linked).

- [ ] **Step 2: Run installer**

```fish
bin/link-config.fish --install
```

Expected: creates `~/.claude/skills/onboard` symlink → repo path.

- [ ] **Step 3: Re-run check**

```fish
bin/link-config.fish --check
```

Expected: PASS (zero errors / zero missing).

- [ ] **Step 4: Manual smoke check**

```fish
test -L ~/.claude/skills/onboard && readlink ~/.claude/skills/onboard
```

Expected: prints the absolute path under the repo.

(No commit — this task verifies install machinery, not source.)

---

## Task 12 — End-to-end smoke test in a scratch dir + final commit

**Files:**
- No source changes.

- [ ] **Step 1: Run the full helper against a scratch directory**

```fish
set -l scratch (mktemp -d)
bin/onboard-scaffold.fish --target $scratch/onboard-smoketest --cadence standard --no-gh
```

Expected: zero exit. Verify by hand:

```fish
ls $scratch/onboard-smoketest/
cat $scratch/onboard-smoketest/RAMP.md
git -C $scratch/onboard-smoketest log --oneline
rm -rf $scratch
```

Expected: dir tree present, `RAMP.md` shows `Cadence: standard`, single git commit "Scaffold /onboard workspace".

- [ ] **Step 2: Full test suite**

```fish
bun test tests/onboard-scaffold.test.ts
bunx tsc --noEmit
fish validate.fish
```

Expected: all pass.

- [ ] **Step 3: Open PR (manual)**

Per CLAUDE.md, fish does not support bash heredocs. Write the PR body to a temp file
and use `--body-file`:

```fish
echo "## Summary
Ships day-0 scaffolder for the senior eng leader 90-day ramp workspace. Phase 1 of
spec at docs/superpowers/specs/2026-04-30-onboard-design.md.

## Test plan
- [ ] bun test tests/onboard-scaffold.test.ts passes
- [ ] bunx tsc --noEmit clean
- [ ] fish validate.fish passes
- [ ] bin/link-config.fish --check passes after install
- [ ] Smoke test: scaffold a throwaway workspace, verify RAMP.md / .gitignore / git log / dir tree by hand

## Out of scope (later phases)
- Phase 2 cadence nags
- Phase 3 confidentiality boundary enforcement at downstream-skill layer
- Phase 4 Calendar integration
- Phase 5 --graduate retro + archive

🤖 Generated with [Claude Code](https://claude.com/claude-code)" > /tmp/onboard-phase1-pr.md

git push -u origin <branch-name>
gh pr create --title "Add /onboard skill — Phase 1 scaffolder MVP (#12)" --body-file /tmp/onboard-phase1-pr.md
```

---

## Self-Review Checklist (run after writing the code, before opening the PR)

1. **Spec coverage** — every Phase 1 line in spec section "Implementation Phases" has a task above? ✅
2. **Placeholder scan** — no `TBD` / `TODO` in code or plan. ✅
3. **Type consistency** — flag names match across SKILL.md, scaffold.md, fish script, tests:
   - `--target`, `--cadence`, `--gh-create`, `--no-gh` (all 4 used identically everywhere) ✅
4. **Test isolation** — each test creates its own `mkdtempSync` fixture and `afterEach` cleans up. ✅
5. **Open Q4 resolved** — auto-prompt at scaffold (option A from brainstorming). The fish helper accepts `--gh-create yes|no`; the prompt itself lives in SKILL.md. ✅

---

## What Phase 2 Picks Up

- Wires `schedule` for milestone-miss + activity-velocity nag jobs.
- Adds `bin/onboard-status.fish` for `/onboard --status <org>` and `/onboard --mute <category>`.
- Updates `RAMP.md` with the mute state.

That plan ships in `docs/superpowers/plans/<date>-onboard-phase-2.md` once Phase 1 lands.
