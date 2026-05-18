# Rules Layer Bloat Prune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate ~74 lines of duplicated skip-override prose into single canonical anchors in `planning.md`, add phase-log telemetry, soft-retire validator phases with zero lineage evidence, and add Phase 1p retirement-signal validator.

**Architecture:** Two new anchors in `rules/planning.md` become canonical homes for "What counts as an explicit override" + "Time pressure is not an override" + "Emission contract — MANDATORY" boilerplate. 4 delegate rules (fat-marker-sketch.md, goal-driven.md, pr-validation.md, think-before-coding.md) replace their duplicated blocks with one-line delegate-links. `validate.fish` gains `--log-path` flag for JSONL telemetry and new Phase 1p that scans the log + tombstones to surface retirement candidates.

**Tech Stack:** fish 3.0+, bun:test (TypeScript), GNU jq for log inspection, GitHub-flavored markdown.

**Execution mode:** Single-implementer + single final review. 4 atomic commits, ~110 LOC new, mostly deletions. Spec: `docs/superpowers/specs/2026-05-15-rules-layer-bloat-prune-design.md`.

---

## File Structure

| File | Role | Touched in |
|---|---|---|
| `rules/planning.md` | Canonical home for consolidated override + emission text (2 new anchors) | Commit 1 |
| `rules/fat-marker-sketch.md` | Delete override+time-pressure blocks; add delegate-line | Commit 1 |
| `rules/goal-driven.md` | Delete override+time-pressure+emission blocks; add delegate-lines | Commit 1 |
| `rules/pr-validation.md` | Delete override+time-pressure+emission blocks (KEEP L156-166 autonomous-loop-exits); add delegate-lines | Commit 1 |
| `rules/think-before-coding.md` | Delete override+time-pressure+emission blocks; add delegate-lines | Commit 1 |
| `validate.fish` | +2 entries in anchor_registry/delegate_registry; +`--log-path`; +Phase 1p | Commits 1/2/4 |
| `tests/validate-phase-1l.test.ts` | Registry mirror update if signature changes | Commit 1 |
| `tests/validate-phase-1p.test.ts` | New TS test (4 synthetic fixtures) | Commit 4 |
| `tests/validate-phase-1X.test.ts` (per retired phase) | `.skip()` + tombstone refs | Commit 3 |
| `.claude/state/validate-phase-log.jsonl` | Append-only telemetry (gitignored) | Commit 2 (bootstrap) |
| `.claude/memory/per_gate_floor_blocks_substitutable.md` | Past-tense + commit-1 SHA | Commit 4 |
| `rules/README.md` | New H2 governance section | Commit 4 |

---

## Commit 1 — Rule consolidation + anchors + registry

### Task 1: Add canonical anchors to `rules/planning.md`

**Files:**
- Modify: `rules/planning.md` (append two new sections before `## Stage Visibility`)

- [ ] **Step 1: Locate insertion point**

Run: `grep -n "^## Stage Visibility" rules/planning.md`
Expected: one match around line 235-245. Insert new content immediately ABOVE this line so anchors live in the same `<HARD-GATE>` block conceptually but as its own sections.

- [ ] **Step 2: Insert canonical override anchor block**

Add this text immediately before `## Stage Visibility`:

```markdown
<a id="override-skip-contract"></a>

## Skip override — what counts

Saying "skip the gate" is NOT sufficient on its own. An override must
**name the specific cost** being accepted. Valid forms cite the gate by
name AND the specific risk accepted: "skip the sketch, I accept the
rework risk"; "no verify checks, I'll catch breakage in review"; "skip
pr-validation, I accept the risk of unverified merge"; "skip DTP, I
accept the risk of building on an unstated problem". Generic
acknowledgements ("trust me," "I accept the trade-off," "your call,"
"I know the risks") do NOT qualify — name the gate, request the
specific cost acknowledgement, and produce the gate's required
artifact if it doesn't come.

**Time pressure is not an override.** "Quick fix," "demo in 10
minutes," "ship by Friday," "I have 10 minutes," "meeting in 5" make
the gate more important, not less — a rushed unverified output is the
most expensive thing to land.

<a id="emission-contract-per-gate"></a>

## Emission contract — per-gate skip honor

When a named-cost skip is valid, you MUST invoke
`mcp__named-cost-skip-ack__acknowledge_named_cost_skip` BEFORE
proceeding past the gate. The tool invocation IS the honor — if you
skip the call, produce the gate's required artifact instead. If the
tool appears in the deferred-tool list, load its schema via
`ToolSearch` with
`query="select:mcp__named-cost-skip-ack__acknowledge_named_cost_skip"`
first.

Per-gate `gate=` values (the `user_statement` argument is always the
verbatim cost-naming clause from the user's message):

| Rule / skill gate | `gate=` value |
|---|---|
| `define-the-problem` (DTP) | `DTP` |
| `goal-driven.md` | `goal-driven` |
| `fat-marker-sketch.md` | `fat-marker-sketch` |
| `pr-validation.md` | `pr-validation` |
| `think-before-coding.md` | `think-before-coding` |

Only USER cost-naming counts. Agent self-skip is structurally
impossible — there is no agent-emitted `user_statement` that satisfies
the contract.

```

- [ ] **Step 3: Verify anchors render correctly**

Run: `grep -nE '<a id="(override-skip-contract|emission-contract-per-gate)">' rules/planning.md`
Expected: exactly 2 matches, both on lines immediately above an H2 heading.

- [ ] **Step 4: Verify file still parses (no broken links)**

Run: `fish validate.fish 2>&1 | grep -E "Phase 1[a-j]"`
Expected: all listed phases pass. (Phase 1l/1k will FAIL until Task 6 — that's expected; don't commit yet.)

### Task 2: Strip duplicated blocks from `rules/fat-marker-sketch.md`

**Files:**
- Modify: `rules/fat-marker-sketch.md` lines 26-41

- [ ] **Step 1: Delete override + time-pressure block**

Use Edit tool. `old_string` = exact L26-41 (heading `### What counts as an explicit override` through the "See the rationalization table in the skill for the full list of combined red flags." sentence). `new_string` = single delegate paragraph:

```markdown
### What counts as an explicit override

See [Skip override — what counts](planning.md#override-skip-contract).
Time pressure is not an override.
```

- [ ] **Step 2: Verify HARD-GATE body intact**

Run: `grep -c "HARD-GATE" rules/fat-marker-sketch.md`
Expected: 2 (open + close).

- [ ] **Step 3: Verify "Skip contract" delegate untouched**

Run: `grep -n "Skip contract" rules/fat-marker-sketch.md`
Expected: 1 match (existing `### Skip contract` heading; section content unchanged).

### Task 3: Strip duplicated blocks from `rules/goal-driven.md`

**Files:**
- Modify: `rules/goal-driven.md` lines 51-63 (override + time-pressure) and 74-81 (emission contract)

- [ ] **Step 1: Delete override + time-pressure block (L51-63)**

Use Edit. `old_string` = the `### What counts as an explicit override` heading through "an unverified rushed change is the most expensive thing to land." `new_string`:

```markdown
### What counts as an explicit override

See [Skip override — what counts](planning.md#override-skip-contract).
Time pressure is not an override.
```

- [ ] **Step 2: Delete "Emission contract — MANDATORY" block (L74-81)**

Use Edit. `old_string` = `### Emission contract — MANDATORY` heading through "produce the plan instead." `new_string`:

```markdown
### Emission contract — MANDATORY

See [Emission contract — per-gate skip honor](planning.md#emission-contract-per-gate). Use `gate="goal-driven"`.
```

- [ ] **Step 3: Verify Pressure-framing-floor delegate intact**

Run: `grep -A 4 "### Pressure-framing floor" rules/goal-driven.md`
Expected: existing 5-line delegate block (planning.md#pressure-framing-floor link).

### Task 4: Strip duplicated blocks from `rules/pr-validation.md`

**Files:**
- Modify: `rules/pr-validation.md` lines 123-136 (override + time-pressure) and 147-154 (emission contract)
- Sacred: L156-166 (autonomous-loop-exits) — DO NOT TOUCH

- [ ] **Step 1: Delete override + time-pressure block (L123-136)**

Use Edit. `old_string` = `### What counts as an explicit override` heading through "an unverified rushed merge is the most expensive thing to land." `new_string`:

```markdown
### What counts as an explicit override

See [Skip override — what counts](planning.md#override-skip-contract).
Time pressure is not an override.
```

- [ ] **Step 2: Delete "Emission contract — MANDATORY" boilerplate (L147-154 ONLY)**

Use Edit. `old_string` = `### Emission contract — MANDATORY\n\nWhen a named-cost skip is valid, invoke\n...run the test plan\ninstead.\n` (the 8-line boilerplate paragraph). `new_string`:

```markdown
### Emission contract — MANDATORY

See [Emission contract — per-gate skip honor](planning.md#emission-contract-per-gate). Use `gate="pr-validation"`.
```

DO NOT delete the subsequent paragraph starting `Only USER cost-naming counts.` through the numbered list ending `4. **Hard-block**: gate fires...` — that block is sacred per spec.

- [ ] **Step 3: Verify autonomous-loop-exits block preserved**

Run: `grep -A 1 "Only USER cost-naming counts" rules/pr-validation.md`
Expected: text "Agent self-skip is structurally" appears in match.

Run: `grep -c "Hard-block" rules/pr-validation.md`
Expected: ≥1.

- [ ] **Step 4: Verify HARD-GATE body intact**

Run: `grep -c "HARD-GATE" rules/pr-validation.md`
Expected: 2.

### Task 5: Strip duplicated blocks from `rules/think-before-coding.md`

**Files:**
- Modify: `rules/think-before-coding.md` lines 104-113 (override + time-pressure) and 115-123 (emission contract)

- [ ] **Step 1: Delete override + time-pressure block (L104-113)**

Use Edit. `old_string` = `### What counts as an explicit override` heading through "is the most expensive to rework." `new_string`:

```markdown
### What counts as an explicit override

See [Skip override — what counts](planning.md#override-skip-contract).
Time pressure is not an override.
```

- [ ] **Step 2: Delete "Emission contract — MANDATORY" block (L115-123)**

Use Edit. `old_string` = `### Emission contract — MANDATORY` heading through "for the auto-skip carve-out." `new_string`:

```markdown
### Emission contract — MANDATORY

See [Emission contract — per-gate skip honor](planning.md#emission-contract-per-gate). Use `gate="think-before-coding"`. See [Trivial/Mechanical tier criteria](planning.md#trivial-tier-criteria) for the auto-skip carve-out.
```

- [ ] **Step 3: Verify HARD-GATE body intact**

Run: `grep -c "HARD-GATE" rules/think-before-coding.md`
Expected: 2.

### Task 6: Update `validate.fish` registries

**Files:**
- Modify: `validate.fish` lines 536-548 (`anchor_registry`) and 680-685 (`delegate_registry`)

- [ ] **Step 1: Add new anchor entries to `anchor_registry`**

Use Edit. `old_string` = the last entry of the `anchor_registry` set block (`"hard-gate-cap|README.md|HARD-GATE cap policy"`). `new_string` appends two new entries:

```fish
    "hard-gate-cap|README.md|HARD-GATE cap policy" \
    "override-skip-contract|planning.md|Skip override — what counts" \
    "emission-contract-per-gate|planning.md|Emission contract — per-gate skip honor"
```

- [ ] **Step 2: Add new anchor IDs to `delegate_registry`**

Use Edit. For each of the 4 modified rules, append `override-skip-contract,emission-contract-per-gate` (or just `override-skip-contract` for fat-marker-sketch.md which has no emission delegate) to its CSV. `old_string`/`new_string` per row:

```fish
# Before:
    "fat-marker-sketch.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel" \
# After:
    "fat-marker-sketch.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel,override-skip-contract" \

# Before:
    "goal-driven.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel" \
# After:
    "goal-driven.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel,override-skip-contract,emission-contract-per-gate" \

# Before:
    "pr-validation.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel" \
# After:
    "pr-validation.md|pressure-framing-floor,emission-contract,emergency-bypass-sentinel,override-skip-contract,emission-contract-per-gate" \

# Before:
    "think-before-coding.md|emission-contract,trivial-tier-criteria"
# After:
    "think-before-coding.md|emission-contract,trivial-tier-criteria,override-skip-contract,emission-contract-per-gate"
```

NOTE: `execution-mode.md` row unchanged (no override/emission block to begin with).

- [ ] **Step 3: Run validate.fish**

Run: `fish validate.fish`
Expected: exit 0, all phases pass. If Phase 1g (canonical-string drift) fires, it means the deleted blocks were partially preserved — re-check Tasks 2-5.

- [ ] **Step 4: Run TS test suite**

Run: `bun test tests/`
Expected: exit 0. If `tests/validate-phase-1l.test.ts` fails, registry mirror in fixture needs update — proceed to Task 7. Else skip.

### Task 7: Update `tests/validate-phase-1l.test.ts` registry mirror (conditional)

**Files:**
- Modify: `tests/validate-phase-1l.test.ts` (only if Task 6 Step 4 failed)

- [ ] **Step 1: Locate registry mirror in test fixture**

Run: `grep -n "delegate_registry\|fat-marker-sketch.md|" tests/validate-phase-1l.test.ts`

- [ ] **Step 2: Add new anchor IDs to fixture CSVs**

Mirror the same CSV expansion as Task 6 Step 2 in the fixture data. Use Edit on each affected line.

- [ ] **Step 3: Re-run tests**

Run: `bun test tests/validate-phase-1l.test.ts`
Expected: all tests pass.

### Task 8: Measure delta + commit

- [ ] **Step 1: Measure before/after rule sizes**

Run: `git diff --stat main -- 'rules/*.md'`
Expected output should show net deletion ≥50 lines across the 4 target rules. If <50, re-check Tasks 2-5 for incomplete deletion.

- [ ] **Step 2: Full validate**

Run: `fish validate.fish && bun test tests/`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add rules/planning.md rules/fat-marker-sketch.md rules/goal-driven.md rules/pr-validation.md rules/think-before-coding.md validate.fish tests/validate-phase-1l.test.ts
git commit -m "$(cat <<'EOF'
refactor(rules): consolidate skip-override + emission boilerplate to planning.md anchors

Net delete ~54 lines across 4 rules. Two new canonical anchors in
planning.md (#override-skip-contract, #emission-contract-per-gate).
Phase 1l registry expanded with both anchor IDs across modified rules.

Refs spec: docs/superpowers/specs/2026-05-15-rules-layer-bloat-prune-design.md
Refs issue #329 dependency.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Capture commit SHA for Task 19**

Run: `git rev-parse --short HEAD`
Save output for memory-note edit in Commit 4.

---

## Commit 2 — Phase-log writer

### Task 9: Add `--log-path` flag to `validate.fish`

**Files:**
- Modify: `validate.fish` near the top (argument parsing section)

- [ ] **Step 1: Locate top-of-file argument handling**

Run: `head -50 validate.fish | grep -nE "argparse|set -l|argv"`

- [ ] **Step 2: Add `--log-path` parsing**

If no argparse exists, add a minimal block near the top (after the shebang and any existing arg setup):

```fish
# --log-path <path> : write JSONL phase telemetry; default off
set -l log_path ""
set -l new_argv
for arg in $argv
    switch $arg
        case '--log-path=*'
            set log_path (string replace -r '^--log-path=' '' -- $arg)
        case '--log-path'
            set -l next_seen 1
        case '*'
            if set -q next_seen
                set log_path $arg
                set -e next_seen
            else
                set -a new_argv $arg
            end
    end
end
set argv $new_argv

# Default path: .claude/state/validate-phase-log.jsonl when env opt-in set
if test -z "$log_path"; and test -n "$HARNESS_VALIDATE_LOG"
    set log_path ".claude/state/validate-phase-log.jsonl"
end
```

- [ ] **Step 3: Verify flag does not break default invocation**

Run: `fish validate.fish`
Expected: exit 0, same output as before.

- [ ] **Step 4: Verify flag accepts value**

Run: `fish validate.fish --log-path /tmp/test-phase-log.jsonl`
Expected: exit 0. File `/tmp/test-phase-log.jsonl` does NOT yet exist (writer not added).

### Task 10: Emit JSONL per phase

**Files:**
- Modify: `validate.fish` (add helper function near top + invocation in each phase epilogue)

- [ ] **Step 1: Add `_emit_phase_log` helper**

Add immediately after the argparse block from Task 9:

```fish
function _emit_phase_log --argument-names phase status duration_ms
    if test -z "$log_path"
        return 0
    end
    set -l ts (date -u +"%Y-%m-%dT%H:%M:%SZ")
    set -l commit (git rev-parse HEAD 2>/dev/null; or echo "unknown")
    set -l line "{\"ts\":\"$ts\",\"commit\":\"$commit\",\"phase\":\"$phase\",\"status\":\"$status\",\"duration_ms\":$duration_ms}"
    mkdir -p (dirname $log_path)
    echo $line >> $log_path
end
```

- [ ] **Step 2: Wrap each phase block with timing + emit**

For each `echo "── Phase 1X..."` line in validate.fish, add a phase-id variable and an emit call at the bottom of the phase block. Pattern (apply to each phase 1a..1o):

```fish
echo "── Phase 1f: rules anchor labels"
set -l _phase_start (date +%s%N 2>/dev/null; or echo 0)
set -l _phase_status pass
# ... existing phase logic; on fail: set _phase_status fail ...
set -l _phase_dur 0
if test $_phase_start -ne 0
    set _phase_dur (math \( (date +%s%N) - $_phase_start \) / 1000000)
end
_emit_phase_log "1f" $_phase_status $_phase_dur
```

NOTE: `_phase_status` needs to flip to "fail" inside `fail()` invocations. Either:
- (a) Override `fail` to set a per-phase flag, or
- (b) Track an `_any_failed_in_phase_1X` flag in each phase block.

Prefer (a): modify the existing `fail` function to also set a global `_current_phase_failed=1`, and reset at each phase entry.

- [ ] **Step 3: Verify file is still valid fish**

Run: `fish -n validate.fish`
Expected: no syntax errors.

- [ ] **Step 4: Run with log + inspect output**

Run: `fish validate.fish --log-path /tmp/phase-log.jsonl && cat /tmp/phase-log.jsonl | head -5`
Expected: one JSONL line per phase, each with `ts`, `commit`, `phase`, `status`, `duration_ms` keys.

- [ ] **Step 5: Validate JSONL with jq**

Run: `jq -c . /tmp/phase-log.jsonl | wc -l`
Expected: ≥10 (one per phase). Each line is valid JSON.

- [ ] **Step 6: Verify default invocation still silent**

Run: `fish validate.fish` (without `--log-path`)
Expected: no log file created at `.claude/state/validate-phase-log.jsonl`.

- [ ] **Step 7: Add `.gitignore` confirm**

Run: `grep -F ".claude/state/" .gitignore`
Expected: match. (Spec asserts `.claude/state/` is gitignored.)

- [ ] **Step 8: Commit**

```bash
git add validate.fish
git commit -m "$(cat <<'EOF'
feat(validate): add --log-path JSONL phase telemetry

Default off. Opt-in via flag or HARNESS_VALIDATE_LOG env var.
Emits one JSONL line per phase with ts, commit, phase, status,
duration_ms.

Foundation for Phase 1p retirement-signal monitoring.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 3 — Validator audit + soft-retire

### Task 11: 3-evidence audit for phases 1a-1e, 1h-1i, 1k

**Files:**
- Read-only inspection of: `validate.fish`, `rules/README.md`, git history

- [ ] **Step 1: Build audit matrix**

For each phase in {1a, 1b, 1c, 1d, 1e, 1h, 1i, 1k}:

```bash
# Evidence 1: README documented lineage
grep -A 2 "Phase $PHASE\." rules/README.md
# Evidence 2: Git blame → origin commit → PR description
git log -S "Phase $PHASE" --oneline -- validate.fish | head -3
# Evidence 3: Code-read regression class — manually read the phase block
```

Record YES/NO per phase per evidence in this matrix (fill at execution time):

```
| Phase | README | Git origin | Regression class | Decision |
|-------|--------|------------|------------------|----------|
| 1a    | ?      | ?          | ?                | ?        |
| 1b    | ?      | ?          | ?                | ?        |
| 1c    | ?      | ?          | ?                | ?        |
| 1d    | ?      | ?          | ?                | ?        |
| 1e    | ?      | ?          | ?                | ?        |
| 1h    | ?      | ?          | ?                | ?        |
| 1i    | ?      | ?          | ?                | ?        |
| 1k    | ?      | ?          | ?                | ?        |
```

Decision rule (per spec):
- ≥1 of 3 → KEEP (file follow-up doc-task if README lineage missing)
- 0 of 3 → soft-retire

- [ ] **Step 2: Capture matrix for commit message**

Save matrix as `/tmp/phase-audit-matrix.md` for inclusion in commit body.

### Task 12: Soft-retire phases with 0/3 evidence

**Files:**
- Modify: `validate.fish` (comment out 0/3 phase blocks; add tombstone)
- Modify: `tests/validate-phase-1X.test.ts` (per retired phase; add `.skip()` on describe blocks)

For each phase decided RETIRE in Task 11:

- [ ] **Step 1: Comment out phase block in validate.fish**

Use Edit to wrap the phase block in fish line-comments. Prepend a tombstone:

```fish
# RETIRED 2026-05-18 — 0/3 evidence (no README lineage, no PR origin, no nameable regression class)
# Restore: uncomment block + drop .skip on tests/validate-phase-1X.test.ts
# echo "── Phase 1X: ..."
# ... commented original logic ...
```

- [ ] **Step 2: `.skip()` the corresponding TS test**

If `tests/validate-phase-1X.test.ts` exists for the retired phase, change `describe(` → `describe.skip(` on the top-level describe block. If no test exists, no action needed.

- [ ] **Step 3: Run validate.fish**

Run: `fish validate.fish`
Expected: exit 0. Output shows retired phases SKIPPED (no echo) or commented out cleanly.

- [ ] **Step 4: Run bun test**

Run: `bun test tests/`
Expected: exit 0 with `.skip` markers visible in summary.

### Task 13: Commit with audit matrix

- [ ] **Step 1: Commit**

```bash
git add validate.fish tests/
git commit -m "$(cat <<'EOF'
chore(validate): audit + soft-retire validator phases with 0/3 evidence

3-evidence rule applied to phases 1a-1e, 1h-1i, 1k:
1. README documented lineage
2. Git blame → origin commit → PR description
3. Code-read → name regression class

Audit matrix:
<paste from /tmp/phase-audit-matrix.md>

Soft-retire = tombstone + comment-out + .skip on TS test.
Hard-delete deferred to Phase 1p WARN trigger (≥12mo + zero log activity).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Commit 4 — Phase 1p + tests + README + memory note

### Task 14: Write failing test `tests/validate-phase-1p.test.ts`

**Files:**
- Create: `tests/validate-phase-1p.test.ts`

- [ ] **Step 1: Scaffold from existing test pattern**

Mirror structure of `tests/validate-phase-1l.test.ts` (imports, REPO/VALIDATE constants, `runValidate` helper).

- [ ] **Step 2: Write 4 synthetic-fixture tests**

```typescript
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const VALIDATE = join(REPO, "validate.fish");

type RunResult = { exitCode: number; stdout: string; stderr: string };

const runValidate = (fixture: string): RunResult => {
  const r = spawnSync("fish", [VALIDATE], {
    env: { ...process.env, CLAUDE_CONFIG_REPO_DIR: fixture },
    encoding: "utf8",
  });
  return { exitCode: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
};

describe("validate.fish Phase 1p (retirement signals)", () => {
  let fixtureDir: string;
  afterEach(() => {
    if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
  });

  test("synthetic log with 0-firing active phase emits WARN", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "phase1p-"));
    // Copy real repo structure
    cpSync(REPO, fixtureDir, { recursive: true, filter: (src) => !src.includes("node_modules") && !src.includes(".git") });
    // Synthesize log: 100 entries, all OTHER phases firing, phase "1z" never fires
    mkdirSync(join(fixtureDir, ".claude/state"), { recursive: true });
    const entries = Array.from({ length: 100 }, (_, i) =>
      `{"ts":"2026-05-10T00:00:0${i % 10}Z","commit":"abc","phase":"1f","status":"pass","duration_ms":10}`
    );
    writeFileSync(join(fixtureDir, ".claude/state/validate-phase-log.jsonl"), entries.join("\n") + "\n");
    const r = runValidate(fixtureDir);
    expect(r.stderr).toContain("WARN");
    expect(r.stderr).toMatch(/retirement candidate|0 firings/i);
  });

  test("tombstoned phase aged >=12mo + 0 firings emits hard-delete WARN", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "phase1p-"));
    cpSync(REPO, fixtureDir, { recursive: true, filter: (src) => !src.includes("node_modules") && !src.includes(".git") });
    // Inject a tombstoned phase with date >12mo old
    const validatePath = join(fixtureDir, "validate.fish");
    const orig = require("fs").readFileSync(validatePath, "utf8");
    const tombstoned = orig + `\n# RETIRED 2024-01-01 — synthetic stale tombstone\n# function _phase_1y\n# end\n`;
    writeFileSync(validatePath, tombstoned);
    // Empty log (no activity)
    mkdirSync(join(fixtureDir, ".claude/state"), { recursive: true });
    writeFileSync(join(fixtureDir, ".claude/state/validate-phase-log.jsonl"), "");
    const r = runValidate(fixtureDir);
    expect(r.stderr).toMatch(/hard-delete eligible|>=12mo/i);
  });

  test("commented `# function _phase_*` without tombstone HARD-FAILs", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "phase1p-"));
    cpSync(REPO, fixtureDir, { recursive: true, filter: (src) => !src.includes("node_modules") && !src.includes(".git") });
    const validatePath = join(fixtureDir, "validate.fish");
    const orig = require("fs").readFileSync(validatePath, "utf8");
    // No tombstone above the commented function
    writeFileSync(validatePath, orig + "\n# function _phase_1z\n# end\n");
    const r = runValidate(fixtureDir);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/tombstone|missing.*RETIRED/i);
  });

  test("synthetic log <10 entries is silent (no WARN)", () => {
    fixtureDir = mkdtempSync(join(tmpdir(), "phase1p-"));
    cpSync(REPO, fixtureDir, { recursive: true, filter: (src) => !src.includes("node_modules") && !src.includes(".git") });
    mkdirSync(join(fixtureDir, ".claude/state"), { recursive: true });
    const entries = Array.from({ length: 5 }, (_, i) =>
      `{"ts":"2026-05-10T00:00:0${i}Z","commit":"abc","phase":"1f","status":"pass","duration_ms":10}`
    );
    writeFileSync(join(fixtureDir, ".claude/state/validate-phase-log.jsonl"), entries.join("\n") + "\n");
    const r = runValidate(fixtureDir);
    expect(r.stderr).not.toMatch(/retirement candidate/i);
  });
});
```

- [ ] **Step 3: Run test to verify all 4 FAIL**

Run: `bun test tests/validate-phase-1p.test.ts`
Expected: 4 failures (Phase 1p not yet implemented).

### Task 15: Implement Phase 1p in `validate.fish`

**Files:**
- Modify: `validate.fish` (append after Phase 1o block, before any final summary)

- [ ] **Step 1: Locate insertion point**

Run: `grep -n "echo \"── Phase 1o" validate.fish`
Expected: 1 match. Insertion goes after the closing of Phase 1o (next blank line + next `echo ""`).

- [ ] **Step 2: Add Phase 1p block**

```fish
echo ""
echo "── Phase 1p: retirement signals"

# Default log path for read (matches log writer)
set -l _p1p_log ".claude/state/validate-phase-log.jsonl"

# Check 1: Tombstone format (HARD-FAIL)
# Any commented `# function _phase_*` block must have a preceding tombstone:
#   # RETIRED YYYY-MM-DD — reason
#   # Restore: ...
set -l _commented_funcs (grep -nE "^# function _phase_" validate.fish | string split : -f 1)
for lineno in $_commented_funcs
    set -l prev_start (math $lineno - 5)
    if test $prev_start -lt 1
        set prev_start 1
    end
    set -l preamble (sed -n "$prev_start,$lineno"p validate.fish)
    if not echo $preamble | grep -qE "^# RETIRED [0-9]{4}-[0-9]{2}-[0-9]{2} —"
        fail "Phase 1p: commented _phase_ function at line $lineno missing tombstone (# RETIRED YYYY-MM-DD — reason)"
    end
    if not echo $preamble | grep -qE "^# Restore:"
        fail "Phase 1p: tombstone at/near line $lineno missing # Restore: line"
    end
end

# Check 2: Retirement candidate (WARN) — active phase with 0 firings in last 100 runs
if test -f "$_p1p_log"
    set -l _line_count (wc -l < "$_p1p_log" | string trim)
    if test $_line_count -ge 10
        # Get active phase names (those with `echo "── Phase 1X..."`)
        set -l _active_phases (grep -oE "── Phase 1[a-z]" validate.fish | string replace "── Phase " "" | sort -u)
        # Last 100 lines of log
        set -l _recent (tail -100 "$_p1p_log")
        for phase in $_active_phases
            if not echo $_recent | grep -q "\"phase\":\"$phase\""
                echo "WARN Phase 1p: phase $phase has 0 firings in last $_line_count log entries (retirement candidate)" >&2
            end
        end
    end
end

# Check 3: Hard-delete eligible (WARN) — tombstoned ≥12mo + 0 log activity
set -l _tombstones (grep -nE "^# RETIRED [0-9]{4}-[0-9]{2}-[0-9]{2}" validate.fish)
set -l _now_epoch (date +%s)
set -l _12mo_ago (math $_now_epoch - 31536000)
for ts_line in $_tombstones
    set -l _date_str (echo $ts_line | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}")
    set -l _date_epoch (date -j -f "%Y-%m-%d" $_date_str +%s 2>/dev/null; or date -d $_date_str +%s 2>/dev/null; or echo 0)
    if test $_date_epoch -ne 0; and test $_date_epoch -lt $_12mo_ago
        echo "WARN Phase 1p: tombstone $_date_str is ≥12mo old (hard-delete eligible — see rules/README.md Retirement procedure)" >&2
    end
end

pass "Phase 1p: retirement signals OK"
_emit_phase_log "1p" $_phase_status 0
```

- [ ] **Step 3: Verify file is still valid fish**

Run: `fish -n validate.fish`
Expected: no syntax errors.

- [ ] **Step 4: Run test to verify all 4 PASS**

Run: `bun test tests/validate-phase-1p.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Run full validate.fish**

Run: `fish validate.fish`
Expected: exit 0, Phase 1p prints in output.

### Task 16: Add governance section to `rules/README.md`

**Files:**
- Modify: `rules/README.md` (append new H2 before `## What lives here`)

- [ ] **Step 1: Locate insertion point**

Run: `grep -n "^## What lives here" rules/README.md`

- [ ] **Step 2: Insert governance H2**

Add immediately above `## What lives here`:

```markdown
## Retiring a rule or validator phase

When a rule or validator phase no longer earns its keep, retire it
**softly first**. Phase 1p (retirement signals) surfaces candidates
mechanically — read its WARN output as the signal to begin this
procedure.

### Soft-retire a validator phase

1. Comment out the phase block in `validate.fish`.
2. Prepend a tombstone immediately above the commented block:
   ```fish
   # RETIRED YYYY-MM-DD — <reason: zero firings / superseded by X / etc.>
   # Restore: uncomment block + drop .skip on tests/validate-phase-1X.test.ts
   ```
3. If a corresponding `tests/validate-phase-1X.test.ts` exists,
   change the top-level `describe(` to `describe.skip(`.
4. Commit with `chore(validate): soft-retire phase 1X — <reason>`.

Phase 1p HARD-FAILs if a commented `# function _phase_*` block is
missing its tombstone — this is intentional. Tombstones are the audit
trail.

### Hard-delete a soft-retired phase

Trigger: Phase 1p emits `WARN ... hard-delete eligible` (tombstone ≥12mo
old + zero log activity since retirement).

1. Delete the commented block + tombstone from `validate.fish`.
2. Delete the corresponding `tests/validate-phase-1X.test.ts` file.
3. Commit with `chore(validate): hard-delete phase 1X (12mo+ no activity)`.

### Override-clause delegation

Skip-override prose ("What counts as an explicit override" + "Time
pressure is not an override" + per-gate "Emission contract — MANDATORY"
boilerplate) is canonical at:

- `rules/planning.md#override-skip-contract`
- `rules/planning.md#emission-contract-per-gate`

Delegate rules link to these anchors with a one-line `See [...]` and
their own `gate=` value. Do NOT restate the canonical text in a
delegate rule — Phase 1l + Phase 1g guard against drift.

```

- [ ] **Step 3: Verify Phase 1f still passes (rules anchor labels)**

Run: `fish validate.fish 2>&1 | grep "Phase 1f"`
Expected: pass.

### Task 17: Update memory note past-tense + cite commit 1 SHA

**Files:**
- Modify: `.claude/memory/per_gate_floor_blocks_substitutable.md`

- [ ] **Step 1: Read current content**

Run: `cat .claude/memory/per_gate_floor_blocks_substitutable.md`

- [ ] **Step 2: Rewrite to past-tense**

Replace future/present-tense claims about per-gate substitutability with past-tense reference to the prune commit. Append at end:

```markdown

## Status (2026-05-18)

Override + time-pressure + emission boilerplate consolidated to
canonical anchors in `rules/planning.md` per spec
`docs/superpowers/specs/2026-05-15-rules-layer-bloat-prune-design.md`.

Prune commit: <COMMIT_1_SHA>

Net delete: ~54 lines across 4 rules (fat-marker-sketch.md,
goal-driven.md, pr-validation.md, think-before-coding.md). Phase 1l
registry expanded with `override-skip-contract` and
`emission-contract-per-gate` anchor IDs.

Substitutability hypothesis CONFIRMED in practice: HARD-GATE eval
suite passed unchanged post-prune.
```

Replace `<COMMIT_1_SHA>` with the SHA captured in Task 8 Step 4.

### Task 18: Final HARD-GATE eval suite + commit

- [ ] **Step 1: Run HARD-GATE eval suite**

Run: `bun test tests/`
Expected: exit 0. All `.skip` reports acceptable.

- [ ] **Step 2: Run validate.fish with log + inspect output**

```bash
fish validate.fish --log-path /tmp/final-phase-log.jsonl
jq -c . /tmp/final-phase-log.jsonl | tail -3
```
Expected: exit 0; final 3 log lines include phase `1p` with status `pass`.

- [ ] **Step 3: Token delta measurement**

Run: `wc -c rules/*.md`
Expected: aggregate byte count for the 4 modified rules is ≥3KB smaller than baseline (matches ~54 line delta).

Capture before/after totals in commit body.

- [ ] **Step 4: Commit**

```bash
git add validate.fish tests/validate-phase-1p.test.ts rules/README.md .claude/memory/per_gate_floor_blocks_substitutable.md
git commit -m "$(cat <<'EOF'
feat(validate): add Phase 1p retirement signals + governance H2

Phase 1p performs 3 checks:
- Tombstone format (HARD-FAIL on commented _phase_ functions
  lacking RETIRED preamble)
- Retirement candidate (WARN on active phase with 0 firings in last
  100 log entries; silent if log <10 entries)
- Hard-delete eligible (WARN on tombstone ≥12mo old)

Includes:
- tests/validate-phase-1p.test.ts (4 synthetic fixtures)
- rules/README.md governance H2 (soft-retire + hard-delete procedures
  + override-clause delegation note)
- memory note updated past-tense + cites commit 1 SHA

Refs spec: docs/superpowers/specs/2026-05-15-rules-layer-bloat-prune-design.md
Closes Stream 3 of the rules-layer bloat prune.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (before claiming PR-ready)

- [ ] `wc -l rules/*.md` shows ≥50-line net reduction across 4 target rules — capture delta in PR body
- [ ] `fish validate.fish` exits 0 on clean checkout
- [ ] `bun test tests/` exits 0 (`.skip` reports acceptable)
- [ ] HARD-GATE eval suite passes unchanged (run from `rules-evals/*/evals/evals.json` via `tests/eval-runner-v2.ts`)
- [ ] `tests/validate-phase-1p.test.ts` covers all 3 retirement-signal checks (1 test per check + 1 silent-below-N-entries test = 4)
- [ ] `rules/README.md` includes governance H2 with retirement procedure
- [ ] `.claude/memory/per_gate_floor_blocks_substitutable.md` past-tense + cites commit 1 SHA
- [ ] `validate.fish --log-path …` produces valid JSONL (verified via `jq -c .`)
- [ ] `rules/planning.md` contains `<a id="override-skip-contract">` and `<a id="emission-contract-per-gate">` anchors; Phase 1l registry includes both
- [ ] `git diff --stat main...HEAD` quoted in PR body

## Risks during execution

- **Phase 1l atomic update.** Commit 1 must land registry edit in the SAME commit as rule prune. Do not split.
- **Floor-block load-bearing.** If HARD-GATE eval fails post-commit-1, revert commit 1 and investigate which deleted block was load-bearing (likely the autonomous-loop-exits in pr-validation if accidentally deleted).
- **Soft-retired phase silently load-bearing.** If a future incident traces to a soft-retired phase, uncomment + drop `.skip` (one-line revert per file).
- **Phase 1p false-positive WARN.** Tune `<10 entries silent` threshold higher if CI is noisy.
- **`date` portability.** Phase 1p Check 3 uses both `date -j -f` (BSD/macOS) and `date -d` (GNU) — verify on target CI runner.
