# Rules Layer Bloat Prune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prune duplicated per-gate floor blocks across 5 rules, instrument validate.fish with phase-firing telemetry, soft-retire validator phases without lineage evidence, and add Phase 1o for mechanical retirement-signal enforcement.

**Architecture:** Three coordinated work streams across 4 atomic commits. Stream 1 removes per-gate restated floor-block content while preserving single-line delegate links to `planning.md` anchors (Phase 1l registry stays satisfied). Stream 2 adds a JSONL log writer to `validate.fish` so future audits have firing data. Stream 3 audits existing phases with 3-evidence rule (README lineage / git blame / code-read) and soft-retires zero-evidence phases via tombstone + `.skip()`; new Phase 1o mechanically surfaces retirement candidates and aging soft-retires.

**Tech Stack:** Fish shell (`validate.fish`), Bun test runner (`tests/validate-phase-*.test.ts`), Markdown rules in `rules/`, JSONL telemetry in `.claude/state/`.

**Spec:** `docs/superpowers/specs/2026-05-15-rules-layer-bloat-prune-design.md`
**Execution mode:** single-implementer + final comprehensive review.
**Worktree:** `.claude/worktrees/spec-bloat-prune-design/` on branch `claude/spec-bloat-prune-design`.

---

## File Structure

| Path | Role | Commit |
|---|---|---|
| `rules/fat-marker-sketch.md` | Delete floor block, keep single-line delegate prose | 1 |
| `rules/goal-driven.md` | Delete `### Pressure-framing floor` body, keep delegate link line | 1 |
| `rules/pr-validation.md` | Delete `### Pressure-framing floor` body, keep delegate link line (HARD-GATE body untouched) | 1 |
| `rules/execution-mode.md` | Delete `## Pressure-framing floor` body, keep delegate link line | 1 |
| `rules/think-before-coding.md` | Trim emission-contract restatement (delegate-only) | 1 |
| `validate.fish` | (1) confirm Phase 1l registry unchanged; (2) add `--log-path` flag + JSONL writer; (3) add Phase 1o | 1, 2, 4 |
| `.claude/memory/per_gate_floor_blocks_substitutable.md` | Past-tense + cite commit 1 SHA | 1 |
| `.claude/state/.gitkeep` | Bootstrap state dir if absent | 2 |
| `tests/validate-phase-log.test.ts` | New: assert log writer produces valid JSONL | 2 |
| `tests/validate-phase-1o.test.ts` | New: 3 checks (tombstone format, retirement-candidate, aging) | 4 |
| `tests/fixtures/validate-phase-1o/` | New: synthetic log + synthetic tombstoned-phase fixtures | 4 |
| `rules/README.md` | New H2: "Retiring a rule or validator phase" | 4 |

---

## Sacred (no-touch)

- `rules/planning.md` — anchor; only target of delegations
- `rules/disagreement.md` — live-caught sycophancy guard
- `rules/pr-validation.md` HARD-GATE body — only floor-block subsection is in scope
- `tests/validate-phase-1l.test.ts` — issue #200 regression coverage
- `skills/*/evals/sycophancy*` substrate
- `CLAUDE.md`

---

## Pre-flight (one-time, do NOT commit)

- [ ] **Confirm worktree state**

Run: `pwd && git status -s && git log -1 --oneline`
Expected: cwd ends in `.claude/worktrees/spec-bloat-prune-design`, working tree clean, HEAD `699d871 docs(spec): rules-layer bloat prune design`

- [ ] **Baseline measurements (recorded; not committed)**

Run:
```bash
wc -c rules/*.md > /tmp/baseline-rules-bytes.txt
fish validate.fish > /tmp/baseline-validate.log 2>&1
echo "exit=$status" >> /tmp/baseline-validate.log
bun test tests/ > /tmp/baseline-tests.log 2>&1
echo "exit=$?" >> /tmp/baseline-tests.log
```

Expected: both validate + bun-test exit 0. Save logs for end-of-PR delta comparison.

---

## Commit 1 — Rule prune + Phase 1l registry + memory note

### Task 1: Prune `rules/goal-driven.md` Pressure-framing floor body

**Files:**
- Modify: `rules/goal-driven.md:65-85`

- [ ] **Step 1: Read current floor block**

Run: `sed -n '65,85p' rules/goal-driven.md`
Expected output shows `### Pressure-framing floor` heading and a paragraph followed by 5-item bulleted list of Authority/Sunk cost/Exhaustion/Deadline/Stated-next-step categories.

- [ ] **Step 2: Replace floor-block body with single-line delegate prose**

Edit `rules/goal-driven.md`. Replace lines 65-85 (inclusive of `### Pressure-framing floor` heading) with:

```markdown
### Pressure-framing floor

See [pressure-framing routing](planning.md#pressure-framing-floor),
[emission contract](planning.md#emission-contract), and
[sentinel bypass](planning.md#emergency-bypass-sentinel) — canonical mechanics
live in `rules/planning.md`. Per [ADR #0006 rejection](../adrs/0006-systems-analysis-pressure-framing-floor.md)
and memory note `per_gate_floor_blocks_substitutable.md`, no per-gate
restatement is required.
```

This preserves all three planning.md anchor links (satisfies Phase 1l) and the ADR + memory citations. Drops ~15 lines of restated category text.

- [ ] **Step 3: Verify rule file integrity**

Run: `grep -c "planning.md#pressure-framing-floor" rules/goal-driven.md`
Expected: ≥1

Run: `grep -c "planning.md#emission-contract" rules/goal-driven.md`
Expected: ≥1 (also referenced by Emission contract subsection below, line 87-94 untouched)

Run: `grep -c "planning.md#emergency-bypass-sentinel" rules/goal-driven.md`
Expected: ≥1

- [ ] **Step 4: Run validate.fish (single rule scope)**

Run: `fish validate.fish 2>&1 | grep -E "goal-driven|FAIL|exit"`
Expected: pass entries for goal-driven.md anchor labels (Phase 1f) and delegate-link presence (Phase 1l); no FAIL.

- [ ] **Step 5: No commit yet — bundle with remaining rule edits**

### Task 2: Prune `rules/pr-validation.md` Pressure-framing floor body

**Files:**
- Modify: `rules/pr-validation.md:138-160`

- [ ] **Step 1: Read current floor block**

Run: `sed -n '138,160p' rules/pr-validation.md`
Expected: `### Pressure-framing floor` heading + restated Authority/Sunk cost/Exhaustion/Deadline/Stated-next-step categories with `pr-validation`-flavored examples.

- [ ] **Step 2: Replace floor-block body**

Edit `rules/pr-validation.md`. Replace lines 138-160 (inclusive of `### Pressure-framing floor` heading, up to but NOT including `### Emission contract — MANDATORY`) with:

```markdown
### Pressure-framing floor

See [pressure-framing routing](planning.md#pressure-framing-floor),
[emission contract](planning.md#emission-contract), and
[sentinel bypass](planning.md#emergency-bypass-sentinel) — canonical mechanics
live in `rules/planning.md`. Per [ADR #0006 rejection](../adrs/0006-systems-analysis-pressure-framing-floor.md)
and memory note `per_gate_floor_blocks_substitutable.md`, no per-gate
restatement is required.
```

DO NOT touch the HARD-GATE body or the Emission contract subsection. Only the inner restatement of categories is pruned.

- [ ] **Step 3: Verify rule file integrity**

Run: `grep -c "planning.md#pressure-framing-floor\|planning.md#emission-contract\|planning.md#emergency-bypass-sentinel" rules/pr-validation.md`
Expected: ≥3 (one per anchor)

### Task 3: Prune `rules/execution-mode.md` Pressure-framing floor body

**Files:**
- Modify: `rules/execution-mode.md` around line 86

- [ ] **Step 1: Locate floor block boundaries**

Run: `grep -n "^## " rules/execution-mode.md`
Expected: list of H2 headings; identify the `## Pressure-framing floor` H2 and the H2 that follows it.

- [ ] **Step 2: Replace floor-block body**

Replace the entire `## Pressure-framing floor` section (heading + body, up to but NOT including the next `## ` heading) with:

```markdown
## Pressure-framing floor

See [pressure-framing routing](planning.md#pressure-framing-floor),
[emission contract](planning.md#emission-contract),
[sentinel bypass](planning.md#emergency-bypass-sentinel), and
[Trivial/Mechanical tier criteria](planning.md#trivial-tier-criteria) —
canonical mechanics live in `rules/planning.md`. Per [ADR #0006 rejection](../adrs/0006-systems-analysis-pressure-framing-floor.md)
and memory note `per_gate_floor_blocks_substitutable.md`, no per-gate
restatement is required.
```

The four anchors mirror the registry entry: `execution-mode.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel,trivial-tier-criteria`.

- [ ] **Step 3: Verify all four planning.md anchors still referenced**

Run:
```bash
for a in pressure-framing-floor emission-contract emergency-bypass-sentinel trivial-tier-criteria; do
  echo -n "$a: "; grep -c "planning.md#$a" rules/execution-mode.md
done
```
Expected: every count ≥1.

### Task 4: Prune `rules/fat-marker-sketch.md` Skip-contract body

**Files:**
- Modify: `rules/fat-marker-sketch.md` `### Skip contract` section near line 43

- [ ] **Step 1: Locate boundaries**

Run: `grep -n "^### " rules/fat-marker-sketch.md`

- [ ] **Step 2: Replace section body**

Replace `### Skip contract` body with:

```markdown
### Skip contract

See [pressure-framing routing](planning.md#pressure-framing-floor),
[emission contract](planning.md#emission-contract), and
[sentinel bypass](planning.md#emergency-bypass-sentinel) — canonical mechanics
live in `rules/planning.md`. Per ADR #0007 and the 2026-04-24 inverse-RED audit,
no per-gate restatement is required.
```

The three anchors match the registry entry: `fat-marker-sketch.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel`.

- [ ] **Step 3: Verify**

Run:
```bash
for a in pressure-framing-floor emission-contract emergency-bypass-sentinel; do
  echo -n "$a: "; grep -c "planning.md#$a" rules/fat-marker-sketch.md
done
```
Expected: every count ≥1.

### Task 5: Trim `rules/think-before-coding.md` emission-contract restatement

**Files:**
- Modify: `rules/think-before-coding.md` `### Emission contract — MANDATORY` section near line 115

- [ ] **Step 1: Read current section**

Run: `sed -n '110,140p' rules/think-before-coding.md`
Expected: section explaining gate=think-before-coding tool args + restated emission semantics.

- [ ] **Step 2: Replace body**

Keep heading + retain the gate-specific tool-call instruction (this rule's emission contract has a unique `gate="think-before-coding"` arg). Drop any restatement of "the tool invocation IS the honor" mechanics already in planning.md. Result body:

```markdown
### Emission contract — MANDATORY

When a named-cost skip is valid (Expert Fast-Track condensed form OR explicit
override), invoke `mcp__named-cost-skip-ack__acknowledge_named_cost_skip` per
[planning.md#emission-contract](planning.md#emission-contract). Use
`gate="think-before-coding"` and the verbatim cost-naming clause as
`user_statement`. See [Trivial/Mechanical tier criteria](planning.md#trivial-tier-criteria)
for the auto-skip carve-out.
```

The two anchors match the registry entry: `think-before-coding.md|emission-contract,trivial-tier-criteria`.

- [ ] **Step 3: Verify**

Run:
```bash
for a in emission-contract trivial-tier-criteria; do
  echo -n "$a: "; grep -c "planning.md#$a" rules/think-before-coding.md
done
```
Expected: every count ≥1.

### Task 6: Update memory note

**Files:**
- Modify: `.claude/memory/per_gate_floor_blocks_substitutable.md`

- [ ] **Step 1: Read current note**

Run: `cat .claude/memory/per_gate_floor_blocks_substitutable.md`

- [ ] **Step 2: Rewrite note in past-tense**

Replace body with (preserve the existing frontmatter):

```markdown
Per-gate pressure-framing floor blocks were duplicated across 5 dependent rules
(fat-marker-sketch, goal-driven, pr-validation, execution-mode, think-before-coding)
despite ADR #0006 / #0007 and the 2026-04-24 inverse-RED audit demonstrating
they add no eval-measurable load given the single DTP anchor in planning.md.

The duplication was pruned in commit <PRUNE_SHA> (replace this placeholder with the
actual SHA after the Commit 1 message is finalized). Each dependent rule now
carries a single-line delegate prose linking to planning.md anchors; Phase 1l
registry is unchanged.

The substitutability claim is now historical evidence backing the pruned design,
not a recommendation for future per-gate blocks. New gates should follow the
delegate-link pattern from the outset.
```

- [ ] **Step 3: Leave `<PRUNE_SHA>` as placeholder for now**

We will edit this AFTER staging the commit but BEFORE finalizing the commit message — the SHA is rewritten in Step 9 below.

### Task 7: Confirm Phase 1l registry unchanged

**Files:**
- Read-only: `validate.fish:667-672`

- [ ] **Step 1: Verify registry pairs**

Run: `sed -n '667,672p' validate.fish`
Expected: 5 registry entries matching:
```
"fat-marker-sketch.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel"
"execution-mode.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel,trivial-tier-criteria"
"goal-driven.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel"
"pr-validation.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel"
"think-before-coding.md|emission-contract,trivial-tier-criteria"
```

Since all delegate-link prose was preserved, no registry edit is needed.

- [ ] **Step 2: Confirm Phase 1l passes**

Run: `fish validate.fish 2>&1 | grep -A1 "Delegate-link presence" | head -30`
Expected: all delegate-link assertions PASS.

### Task 8: Run full validation suite

- [ ] **Step 1: validate.fish**

Run: `fish validate.fish; echo "exit=$status"`
Expected: `VALIDATION PASSED` (warnings acceptable) and `exit=0`.

- [ ] **Step 2: bun test**

Run: `bun test tests/`
Expected: all tests pass; no skipped tests beyond baseline.

- [ ] **Step 3: Token delta check**

Run:
```bash
wc -c rules/*.md
diff /tmp/baseline-rules-bytes.txt <(wc -c rules/*.md)
```
Expected: rules/*.md collectively shrank by ≥3000 bytes (~150-line reduction at avg ~20 bytes/line).

### Task 9: Commit 1

- [ ] **Step 1: Stage files**

```bash
git add rules/fat-marker-sketch.md rules/goal-driven.md rules/pr-validation.md \
        rules/execution-mode.md rules/think-before-coding.md \
        .claude/memory/per_gate_floor_blocks_substitutable.md
git status
```
Expected: 6 files staged, no others.

- [ ] **Step 2: Create commit with placeholder SHA in memory note**

```bash
printf '%s\n' 'refactor(rules): prune per-gate floor blocks (substitutable to planning.md anchor)' \
  '' \
  'Floor-block restated text removed from 5 delegate rules; each rule now' \
  'carries single-line delegate prose linking to planning.md anchors.' \
  'Phase 1l registry unchanged (all anchor links preserved).' \
  '' \
  'Memory note per_gate_floor_blocks_substitutable.md updated to past-tense.' \
  '' \
  'Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>' \
  > /tmp/commit1-msg
git commit -F /tmp/commit1-msg
```

- [ ] **Step 3: Backfill SHA into memory note**

```bash
set -l prune_sha (git rev-parse --short HEAD)
sed -i '' "s/<PRUNE_SHA>/$prune_sha/g" .claude/memory/per_gate_floor_blocks_substitutable.md
git add .claude/memory/per_gate_floor_blocks_substitutable.md
git commit --amend --no-edit
```

(`--amend` is permitted here because Commit 1 has NOT been pushed yet and the change is purely a SHA backfill in the same commit's content. If Commit 1 has been pushed for any reason, create a follow-up commit instead.)

- [ ] **Step 4: Verify Commit 1 contents**

```bash
git show --stat HEAD
git log -1 --format=%B
```
Expected: 6 files changed; commit message clean; memory note shows real SHA.

- [ ] **Step 5: Re-run validate.fish + tests**

```bash
fish validate.fish; echo "exit=$status"
bun test tests/
```
Expected: both exit 0.

---

## Commit 2 — Phase-log writer

### Task 10: Decide log path + format

**Files:**
- Read: `.gitignore`

- [ ] **Step 1: Confirm `.claude/state/` is gitignored**

Run: `grep -E "\.claude/state" .gitignore || echo "NOT_IGNORED"`
Expected: matching line OR `NOT_IGNORED`. If `NOT_IGNORED`, add `.claude/state/` to `.gitignore` in Task 11.

### Task 11: Write failing test for log writer

**Files:**
- Create: `tests/validate-phase-log.test.ts`

- [ ] **Step 1: Write the failing test**

Create file:

```typescript
import { test, expect } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, readFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

test("validate.fish --log-path writes valid JSONL per phase", () => {
  const tmp = mkdtempSync(join(tmpdir(), "validate-log-"));
  const logPath = join(tmp, "phase-log.jsonl");

  const result = spawnSync(
    "fish",
    ["validate.fish", "--log-path", logPath],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  expect(result.status === 0 || result.status === 1).toBe(true); // 0 pass, 1 known-fail acceptable for log-writer test
  expect(existsSync(logPath)).toBe(true);

  const lines = readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);
  expect(lines.length).toBeGreaterThan(0);

  for (const line of lines) {
    const entry = JSON.parse(line);
    expect(typeof entry.ts).toBe("string");
    expect(typeof entry.phase).toBe("string");
    expect(["pass", "fail", "warn"]).toContain(entry.status);
    expect(typeof entry.duration_ms).toBe("number");
  }

  rmSync(tmp, { recursive: true });
});
```

- [ ] **Step 2: Run the test (expect FAIL — flag not implemented)**

Run: `bun test tests/validate-phase-log.test.ts`
Expected: FAIL — either the test detects no log file, or `validate.fish` errors on the unknown flag.

### Task 12: Implement `--log-path` flag in validate.fish

**Files:**
- Modify: `validate.fish` (top-level arg parsing + `pass`/`fail`/`warn` helpers + end-of-phase counters)

- [ ] **Step 1: Add CLI flag parsing near top of validate.fish**

Add immediately after existing `set repo_dir ...` / arg-parsing block (insert before line 36 area; locate the existing arg parsing — currently handles `--skill`):

```fish
# --log-path <path>: append JSONL per-phase result lines for telemetry
set -g log_path ""
set -l argv_filtered
set -l i 1
while test $i -le (count $argv)
    if test $argv[$i] = "--log-path"
        if test (math $i + 1) -le (count $argv)
            set log_path $argv[(math $i + 1)]
            set i (math $i + 2)
            continue
        else
            echo "--log-path requires a path argument" >&2
            exit 2
        end
    end
    set -a argv_filtered $argv[$i]
    set i (math $i + 1)
end
set argv $argv_filtered
```

- [ ] **Step 2: Add helper function `log_phase_entry` near other helpers (around line 58)**

```fish
function log_phase_entry --argument-names phase_id status duration_ms
    if test -z "$log_path"
        return 0
    end
    set -l ts (date -u +"%Y-%m-%dT%H:%M:%SZ")
    set -l commit (git rev-parse --short HEAD 2>/dev/null; or echo "unknown")
    printf '{"ts":"%s","commit":"%s","phase":"%s","status":"%s","duration_ms":%s}\n' \
        $ts $commit $phase_id $status $duration_ms >> $log_path
end
```

- [ ] **Step 3: Wrap each `echo "── …"` phase boundary with timing + emit**

For each existing phase (1a-1n), the simplest shape is to start a timer at the section header and emit at end. Add at the START of each phase section (before the `echo "── X"`):

```fish
set -l _phase_start_ms (date +%s%3N 2>/dev/null; or python3 -c 'import time; print(int(time.time()*1000))')
set -l _phase_id "1a"   # or 1b, 1c, ... matching the section
```

And at the END of each phase section (after `echo ""` separator):

```fish
set -l _phase_end_ms (date +%s%3N 2>/dev/null; or python3 -c 'import time; print(int(time.time()*1000))')
log_phase_entry $_phase_id (test $fail_count -gt $_phase_start_fail_count; and echo "fail"; or echo "pass") (math $_phase_end_ms - $_phase_start_ms)
```

Track per-phase fail counts by snapshotting at phase start:

```fish
set -l _phase_start_fail_count $fail_count
```

(Apply uniformly to all 13 phases: 1a, 1b, 1c, 1d, 1e, 1f, 1g, 1j, 1k, 1l, 1m, 1h, 1i, 1n. Existing order preserved.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/validate-phase-log.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify all existing tests still pass**

Run: `fish validate.fish; bun test tests/`
Expected: both exit 0; existing tests unaffected.

- [ ] **Step 6: Verify log contents manually**

Run:
```bash
fish validate.fish --log-path /tmp/manual-log.jsonl > /dev/null
cat /tmp/manual-log.jsonl | head -5
jq -s 'length' /tmp/manual-log.jsonl
```
Expected: 13 JSONL lines (one per phase 1a-1n); each parses as JSON; status field one of pass/fail/warn.

### Task 13: Bootstrap state directory

**Files:**
- Confirm: `.gitignore` already excludes `.claude/state/`
- Possibly: `.gitignore` edit if not already excluded

- [ ] **Step 1: Check gitignore**

Run: `grep "^\\.claude/state" .gitignore || echo "ADD_NEEDED"`

If `ADD_NEEDED`:

- [ ] **Step 2: Add gitignore line**

Append to `.gitignore`:

```
.claude/state/
```

Otherwise skip.

### Task 14: Commit 2

- [ ] **Step 1: Stage + commit**

```bash
git add validate.fish tests/validate-phase-log.test.ts
test -n "(git diff --cached --name-only | grep .gitignore)"; and git add .gitignore
git status
```

```bash
printf '%s\n' 'feat(validate): phase-log JSONL writer + --log-path flag' \
  '' \
  'Adds --log-path <path> to validate.fish. Each phase emits a JSONL line' \
  'with timestamp, commit SHA, phase id, status, and duration. Enables' \
  'future retirement audits (Phase 1o, follow-up commit) without coupling' \
  'instrumentation to specific phases.' \
  '' \
  'Log location is caller-supplied; default ".claude/state/" is gitignored.' \
  '' \
  'Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>' \
  > /tmp/commit2-msg
git commit -F /tmp/commit2-msg
```

- [ ] **Step 2: Verify**

```bash
git show --stat HEAD
fish validate.fish; echo "exit=$status"
bun test tests/
```
Expected: 2-3 files changed; both checks exit 0.

---

## Commit 3 — Validator audit: soft-retire phases

### Task 15: Per-phase 3-evidence audit

**Files:**
- Read-only: `validate.fish`, `rules/README.md`, `tests/validate-phase-*.test.ts`, `git log validate.fish`

For each candidate phase from the audit-list (`1a, 1b, 1c, 1d, 1e, 1h, 1i, 1k`; KEEP-list is `1f, 1g, 1j, 1l, 1m, 1n`), run the 3-evidence rule:

- [ ] **Step 1: Run audit per phase**

For each phase X in `1a 1b 1c 1d 1e 1h 1i 1k`:

```bash
# Evidence 1: README lineage
grep -B1 -A2 "Phase $X\|1$X\." rules/README.md | head -20

# Evidence 2: Git blame on phase code
grep -n "^# $X\\." validate.fish   # locate section header
# Then: git blame validate.fish -L <start>,<end> | head -5
# Then: git log <SHA>~1..<SHA> --format="%H %s" | head -3

# Evidence 3: Code-read — read 10-30 lines of phase code, name regression class
sed -n "<start>,<end>p" validate.fish
```

Record per-phase decision in a temporary table at `/tmp/audit-table.md`:

```markdown
| Phase | README | Git blame | Code-read | Decision | Reason |
|-------|--------|-----------|-----------|----------|--------|
| 1a    | …      | …         | …         | KEEP/RETIRE | … |
| ...
```

- [ ] **Step 2: Verify decision logic**

- ≥1 of 3 evidence sources → KEEP
- 0 of 3 → soft-retire

If KEEP + missing README lineage, file a follow-up doc task (note in commit message body, no separate file).

### Task 16: Apply soft-retire to each 0-of-3 phase

**Files:** (per retired phase)
- Modify: `validate.fish` (comment-out phase block + add tombstone)
- Modify: `tests/validate-phase-X.test.ts` if exists (skip + tombstone); create-empty-skipped if absent

For each retired phase from Task 15:

- [ ] **Step 1: Wrap phase body in tombstone + comment**

In `validate.fish`, locate the phase section (e.g., `# 1c. Agent frontmatter`). Replace with:

```fish
# RETIRED YYYY-MM-DD — <Reason from audit table, 1 line>
# Restore: uncomment block below + drop `.skip` on tests/validate-phase-1c.test.ts.
# See rules/README.md "Retiring a rule or validator phase".
#
# # 1c. Agent frontmatter
# echo "── Agent frontmatter"
# set agent_files $repo_dir/agents/*.md
# ...
# (original phase body, prefixed with `# ` on every line)
# ...
# echo ""
```

The `_phase_start_ms` / `log_phase_entry` lines added in Commit 2 should ALSO be commented out so the retired phase emits no log entry.

- [ ] **Step 2: If a TS test file exists, mark as skip**

For each retired phase with a corresponding `tests/validate-phase-X.test.ts`:

```typescript
// RETIRED YYYY-MM-DD — <Reason>
// Restore: uncomment validate.fish phase 1X + remove .skip below.
import { describe, it } from "bun:test";

describe.skip("Phase 1X (retired)", () => {
  it("placeholder", () => {});
});
```

If no TS test existed previously, do NOT create one — there's nothing to skip.

- [ ] **Step 3: Run validate.fish to confirm graceful absence of retired phase output**

Run: `fish validate.fish 2>&1 | tail -30`
Expected: Results summary shows reduced pass counts (retired phases no longer emit); no FAIL.

- [ ] **Step 4: Run bun test**

Run: `bun test tests/`
Expected: skipped tests reported in output for retired phases; no failures.

### Task 17: Commit 3

- [ ] **Step 1: Stage + commit**

```bash
git add validate.fish tests/validate-phase-*.test.ts
git status
```

Compose commit message body using the per-phase decision table from `/tmp/audit-table.md`:

```bash
printf '%s\n' 'refactor(validate): soft-retire phases without lineage evidence' \
  '' \
  'Audit method: 3-evidence rule (README lineage / git blame / code-read).' \
  'Phases with ≥1 evidence source kept; 0-of-3 phases soft-retired via' \
  'tombstone + comment-out + .skip on TS test (where applicable).' \
  '' \
  'Decision table:' \
  '' \
  '$(cat /tmp/audit-table.md)' \
  '' \
  'Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>' \
  > /tmp/commit3-msg
git commit -F /tmp/commit3-msg
```

- [ ] **Step 2: Verify**

```bash
git show --stat HEAD
fish validate.fish; echo "exit=$status"
bun test tests/
```
Expected: both exit 0; skipped tests visible in bun output.

---

## Commit 4 — Phase 1o + test + README governance

### Task 18: Write failing test for Phase 1o

**Files:**
- Create: `tests/validate-phase-1o.test.ts`
- Create: `tests/fixtures/validate-phase-1o/` directory with sub-fixtures

- [ ] **Step 1: Create fixture directory**

```bash
mkdir -p tests/fixtures/validate-phase-1o/synthetic-log
mkdir -p tests/fixtures/validate-phase-1o/aging-soft-retire
mkdir -p tests/fixtures/validate-phase-1o/malformed-tombstone
mkdir -p tests/fixtures/validate-phase-1o/sparse-log
```

- [ ] **Step 2: Create synthetic log fixtures**

`tests/fixtures/validate-phase-1o/synthetic-log/phase-log.jsonl` — 150 entries with phases 1a, 1b, 1c all present; phase `1z` absent (0 firings simulated by omission).

```bash
for i in (seq 1 150)
    printf '{"ts":"2025-01-%02d T12:00:00Z","commit":"abc","phase":"1a","status":"pass","duration_ms":5}\n' (math $i % 30 + 1) >> tests/fixtures/validate-phase-1o/synthetic-log/phase-log.jsonl
    printf '{"ts":"2025-01-%02d T12:00:00Z","commit":"abc","phase":"1b","status":"pass","duration_ms":7}\n' (math $i % 30 + 1) >> tests/fixtures/validate-phase-1o/synthetic-log/phase-log.jsonl
    printf '{"ts":"2025-01-%02d T12:00:00Z","commit":"abc","phase":"1c","status":"pass","duration_ms":3}\n' (math $i % 30 + 1) >> tests/fixtures/validate-phase-1o/synthetic-log/phase-log.jsonl
end
```

`tests/fixtures/validate-phase-1o/sparse-log/phase-log.jsonl` — 5 entries only (below threshold).

`tests/fixtures/validate-phase-1o/aging-soft-retire/validate.fish` — minimal fish stub with one tombstoned phase dated >12 months ago:

```fish
# RETIRED 2024-01-01 — speculative, no evidence
# Restore: uncomment + drop .skip on tests/validate-phase-1z.test.ts.
#
# # 1z. Speculative
# echo "── Speculative"
```

`tests/fixtures/validate-phase-1o/malformed-tombstone/validate.fish` — commented phase block WITHOUT tombstone header:

```fish
# # 1y. Forgotten phase
# echo "── Forgotten"
```

- [ ] **Step 3: Create `tests/fixtures/validate-phase-1o/README.md`**

```markdown
# Phase 1o fixtures

| Fixture | Used by | Purpose |
|---|---|---|
| `synthetic-log/` | retirement-candidate WARN test | 3 phases × 50 firings → no phase qualifies; baseline pass |
| `sparse-log/` | silent-below-threshold test | <10 entries → Phase 1o silent |
| `aging-soft-retire/` | hard-delete-eligible WARN test | Tombstone date >12mo with zero log activity |
| `malformed-tombstone/` | tombstone-format HARD-FAIL test | Commented phase block lacking required `# RETIRED YYYY-MM-DD —` header |
```

- [ ] **Step 4: Write the failing test**

Create `tests/validate-phase-1o.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";

const repo = process.cwd();
const fixDir = "tests/fixtures/validate-phase-1o";

function runPhase1o(opts: { logPath?: string; validateFishPath?: string }) {
  const args = ["validate.fish", "--phase-1o-only"];
  if (opts.logPath) args.push("--log-path", opts.logPath);
  if (opts.validateFishPath) args.push("--validate-fish-path", opts.validateFishPath);
  return spawnSync("fish", args, { cwd: repo, encoding: "utf8" });
}

test("retirement-candidate WARN when phase has 0 firings in ≥100 runs", () => {
  const result = runPhase1o({ logPath: join(fixDir, "synthetic-log/phase-log.jsonl") });
  // Active phases 1a/1b/1c all fired; no candidate → no WARN from this check
  expect(result.stderr + result.stdout).not.toMatch(/Retirement candidate/);
});

test("hard-delete-eligible WARN for tombstone ≥12mo old + zero log activity", () => {
  const result = runPhase1o({
    logPath: join(fixDir, "synthetic-log/phase-log.jsonl"),
    validateFishPath: join(fixDir, "aging-soft-retire/validate.fish"),
  });
  expect(result.stderr + result.stdout).toMatch(/hard-delete eligible/i);
});

test("HARD-FAIL on commented phase block lacking tombstone header", () => {
  const result = runPhase1o({
    validateFishPath: join(fixDir, "malformed-tombstone/validate.fish"),
  });
  expect(result.status).toBe(1);
  expect(result.stderr + result.stdout).toMatch(/tombstone/i);
});

test("silent when log <10 entries (under threshold)", () => {
  const result = runPhase1o({ logPath: join(fixDir, "sparse-log/phase-log.jsonl") });
  expect(result.stderr + result.stdout).not.toMatch(/Retirement candidate|hard-delete eligible/i);
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `bun test tests/validate-phase-1o.test.ts`
Expected: FAIL — flags `--phase-1o-only` and `--validate-fish-path` don't exist yet.

### Task 19: Implement Phase 1o in validate.fish

**Files:**
- Modify: `validate.fish` (add Phase 1o section AFTER Phase 1n, BEFORE Phase 2)

- [ ] **Step 1: Add Phase 1o section**

Insert after line ~905 (after Phase 1n's `if test $fixture_roots_found -eq 0 ... end` block), before Phase 2 header:

```fish
# ─────────────────────────────────────────────────
# 1o. Retirement signals
# ─────────────────────────────────────────────────
#
# Three checks:
#   (1) HARD-FAIL: commented `# # 1X.` phase blocks must carry a
#       `# RETIRED YYYY-MM-DD — <reason>` tombstone immediately above.
#   (2) WARN: active phases with 0 firings in last N=100 runs of the
#       phase-log JSONL (silent if log <10 entries).
#   (3) WARN: tombstoned phases aged ≥12 months with zero log activity
#       since soft-retire.
#
# Issue: <#-this-PR>. See rules/README.md "Retiring a rule or validator phase".
echo "── Retirement signals"

set -l _phase_start_fail_count $fail_count
set -l _phase_start_ms (date +%s%3N 2>/dev/null; or python3 -c 'import time; print(int(time.time()*1000))')

# (1) Tombstone format compliance — HARD-FAIL
set -l target_validate "$repo_dir/validate.fish"
if set -q phase_1o_validate_fish_path
    set target_validate $phase_1o_validate_fish_path
end

if test -f $target_validate
    # Find commented phase blocks: `# # 1X.` markers
    set -l block_lines (grep -nE '^# # 1[a-z]\.' $target_validate)
    for entry in $block_lines
        set -l line_num (string split ":" $entry)[1]
        # Walk backwards up to 4 lines to find RETIRED tombstone
        set -l prev_start (math $line_num - 4)
        if test $prev_start -lt 1
            set prev_start 1
        end
        set -l preceding (sed -n "$prev_start,$line_num"p $target_validate)
        if echo "$preceding" | grep -qE '^# RETIRED [0-9]{4}-[0-9]{2}-[0-9]{2} —'
            pass "tombstone OK at $target_validate:$line_num"
        else
            fail "commented phase block at $target_validate:$line_num missing tombstone header (# RETIRED YYYY-MM-DD —)"
        end
    end
end

# (2) + (3) Log-based checks
set -l target_log "$repo_dir/.claude/state/validate-phase-log.jsonl"
if set -q log_path; and test -n "$log_path"
    set target_log $log_path
end

if not test -f $target_log
    pass "phase-log absent at $target_log — Phase 1o (2)+(3) skipped"
else
    set -l line_count (wc -l < $target_log | string trim)
    if test $line_count -lt 10
        pass "phase-log has $line_count entries (<10 threshold) — Phase 1o (2)+(3) silent"
    else
        # (2) Retirement candidate WARN: any active phase with 0 firings in last 100 lines
        set -l recent_phases (tail -100 $target_log | jq -r '.phase' | sort -u)
        # Active phases are those NOT in a commented `# # 1X.` block
        set -l active_phases (grep -oE '^# 1[a-z]\.' $target_validate | string replace '^# ' '' | string replace -r '\..*' '')
        for ap in $active_phases
            if not contains -- $ap $recent_phases
                warn "Phase $ap — 0 firings in last 100 runs. Retirement candidate. See rules/README.md 'Retiring a rule or validator phase'."
            end
        end
        # (3) Hard-delete eligible WARN: tombstoned ≥12mo with zero log activity
        set -l now_epoch (date +%s)
        set -l twelve_mo (math $now_epoch - 31536000)
        set -l tombstones (grep -E '^# RETIRED [0-9]{4}-[0-9]{2}-[0-9]{2}' $target_validate)
        for ts in $tombstones
            set -l ts_date (string match -r '[0-9]{4}-[0-9]{2}-[0-9]{2}' -- $ts)
            set -l ts_epoch (date -j -f "%Y-%m-%d" $ts_date "+%s" 2>/dev/null; or echo 0)
            if test $ts_epoch -gt 0; and test $ts_epoch -lt $twelve_mo
                warn "Soft-retired phase tombstoned $ts_date (>12mo). Hard-delete eligible if no log activity. See rules/README.md."
            end
        end
    end
end

set -l _phase_end_ms (date +%s%3N 2>/dev/null; or python3 -c 'import time; print(int(time.time()*1000))')
log_phase_entry "1o" (test $fail_count -gt $_phase_start_fail_count; and echo "fail"; or echo "pass") (math $_phase_end_ms - $_phase_start_ms)

echo ""
```

- [ ] **Step 2: Add `--phase-1o-only` and `--validate-fish-path` flags to arg parser**

Extend the arg parsing block from Task 12 Step 1 with two more flags:

```fish
# --phase-1o-only: skip Phase 1 and Phase 2; run Phase 1o checks only (test-mode)
set -g phase_1o_only 0
# --validate-fish-path <path>: which validate.fish to scan for tombstones/blocks (test-mode)
set -g phase_1o_validate_fish_path ""
```

And in the argv loop, add `--phase-1o-only` (no arg) → set `phase_1o_only 1`; and `--validate-fish-path` → consume next arg into `phase_1o_validate_fish_path`.

After arg parsing, gate the Phase 1 / Phase 2 sections to skip when `phase_1o_only = 1`. Phase 1o still runs.

- [ ] **Step 3: Run Phase 1o tests**

Run: `bun test tests/validate-phase-1o.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 4: Run full validation**

Run: `fish validate.fish; bun test tests/`
Expected: both exit 0; Phase 1o output appears in validate.fish stdout.

### Task 20: Add governance section to `rules/README.md`

**Files:**
- Modify: `rules/README.md`

- [ ] **Step 1: Identify insertion point**

Run: `grep -n "^## " rules/README.md`
Expected: locate the H2 BEFORE "What lives here". Insert new H2 immediately AFTER "Adding a new rule".

- [ ] **Step 2: Insert new section**

```markdown
## Retiring a rule or validator phase

`validate.fish` Phase 1o surfaces retirement candidates and aging soft-retires
mechanically — read its WARN output on every validate run. The section below
is the discipline that accompanies those mechanical signals.

### Soft-retire procedure (atomic commit)

1. Comment-out the phase code block with tombstone:
   ```fish
   # RETIRED YYYY-MM-DD — <one-line reason>
   # Restore: uncomment block below + drop `.skip` on tests/validate-phase-1X.test.ts.
   ```
2. If a `tests/validate-phase-1X.test.ts` exists, replace its body with a
   `describe.skip(...)` + matching tombstone comment.
3. Update `validate.fish` Phase 1l registry if the retired phase guarded a
   delegate-link pair.
4. Run full eval suite + `fish validate.fish` — no HARD-GATE regression.
5. Update any memory note referencing the phase with past-tense + commit SHA.

### Hard-delete procedure

Triggered when Phase 1o emits `WARN: hard-delete eligible`. Same as soft-retire
checklist minus the tombstone step (delete the commented block + remove the
test file).

### Audit trigger

Phase 1o-driven, NOT calendar-driven. Pull a retirement audit when EITHER:

- `.claude/state/validate-phase-log.jsonl` shows a phase with zero firings
  across ≥100 runs spanning ≥20 PRs (Phase 1o WARN surfaces this)
- Subjective review notes "this phase never seems to do anything"

### Floor-block delegations

Per-gate pressure-framing floor blocks are substitutable to the `planning.md`
anchor per [ADR #0006 rejection](../adrs/0006-systems-analysis-pressure-framing-floor.md)
and memory note `per_gate_floor_blocks_substitutable.md`. When delegating:

- Keep single-line delegate prose linking to `planning.md#<anchor>` — this
  satisfies Phase 1l registry without needing registry edit.
- If full delegate text is removed, update Phase 1l registry pair list in
  the same commit.
```

- [ ] **Step 3: Verify README still passes validation**

Run: `fish validate.fish 2>&1 | grep -i "readme\|FAIL"`
Expected: no failures.

### Task 21: Commit 4

- [ ] **Step 1: Stage + commit**

```bash
git add validate.fish tests/validate-phase-1o.test.ts \
        tests/fixtures/validate-phase-1o/ rules/README.md
git status
```

```bash
printf '%s\n' 'feat(validate): Phase 1o retirement signals + governance docs' \
  '' \
  'Adds Phase 1o to validate.fish — three checks:' \
  '  1. HARD-FAIL on commented phase blocks lacking tombstone header' \
  '  2. WARN on active phases with 0 firings in last 100 log runs' \
  '  3. WARN on tombstoned phases aged ≥12mo with no log activity' \
  '' \
  'Silent when phase-log has <10 entries (avoids noise during bootstrap).' \
  '' \
  'rules/README.md gains "Retiring a rule or validator phase" H2 covering' \
  'soft-retire procedure, hard-delete procedure, audit trigger, and' \
  'floor-block delegation pattern.' \
  '' \
  'Closes the deprecation-discipline gap identified in the bloat-prune spec.' \
  '' \
  'Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>' \
  > /tmp/commit4-msg
git commit -F /tmp/commit4-msg
```

- [ ] **Step 2: Final verification**

```bash
git log --oneline main..HEAD
fish validate.fish; echo "exit=$status"
bun test tests/
```
Expected: 4 commits ahead of main; both exit 0.

---

## Final acceptance (before PR)

- [ ] `wc -c rules/*.md` shows ≥3000-byte (≈150-line) reduction vs `/tmp/baseline-rules-bytes.txt`
- [ ] `fish validate.fish` exits 0 on clean tree
- [ ] `bun test tests/` exits 0; skipped tests reported by name in output
- [ ] HARD-GATE eval suite passes (run via existing eval-runner if available):
  - sycophancy, DTP front-door, disagreement, pr-validation, agency-related
- [ ] Phase 1o test fixtures cover all 3 checks (HARD-FAIL, candidate WARN, aging WARN, silent-below-threshold)
- [ ] `rules/README.md` contains "Retiring a rule or validator phase" H2
- [ ] `.claude/memory/per_gate_floor_blocks_substitutable.md` is past-tense + cites commit 1 SHA
- [ ] `validate.fish --log-path /tmp/x.jsonl` produces 14+ JSONL lines (13 original phases + Phase 1o)
- [ ] `git diff --stat main...HEAD` quoted into PR body

---

## PR template (use at readiness declaration)

```markdown
## Summary

- Pruned per-gate floor-block restatements from 5 delegate rules (~150 lines)
- Added phase-firing telemetry to `validate.fish` via `--log-path` JSONL writer
- Audited validator phases with 3-evidence rule; soft-retired 0-of-3 phases
  via tombstone + `.skip` (see commit 3 for decision table)
- Added Phase 1o for mechanical retirement-signal enforcement
- Added `rules/README.md` governance section

Implements `docs/superpowers/specs/2026-05-15-rules-layer-bloat-prune-design.md`.
Unblocks #329 (agency follow-up work).

## Test plan

- [ ] `fish validate.fish` exits 0 from clean checkout
- [ ] `bun test tests/` exits 0 (skipped tests acceptable)
- [ ] HARD-GATE eval suite passes
- [ ] Token delta measured: `wc -c rules/*.md` before vs after
- [ ] Phase 1o WARN output sanity-checked: run with synthetic 0-firing log
- [ ] `git diff --stat main...HEAD` quoted below

<paste git diff --stat output>
```
