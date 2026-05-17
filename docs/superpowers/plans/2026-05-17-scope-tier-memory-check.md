# Scope-Tier Memory Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-layer scope-tier memory check (mechanical `UserPromptSubmit` hook + rule-text response contract) that fires at pipeline entry on PR #330-class small/mechanical prompts and routes them to direct implementation, skipping the planning pipeline.

**Architecture:** Layer 1 is a `bash` + `jq` `UserPromptSubmit` hook (`hooks/scope-tier-memory-check.sh`) that scans the user prompt + `MEMORY.md` against six conjunctive criteria and emits a `<system-reminder>` on match. Layer 2 is a new subsection in `rules/planning.md` step 1 governing the model's response to that reminder. Test substrate gets a new optional `additional_context` field on the `Eval` shape so routing-contract evals can inject reminders without installing the real hook.

**Tech Stack:** Bash 3+, `jq` (already used by `hooks/block-dangerous-git.sh`), `fish` for installer, TypeScript + Bun for test substrate and validate phase tests, `shellcheck` for hook quality.

**Source spec:** `docs/superpowers/specs/2026-05-17-scope-tier-memory-check-design.md`

---

## Pre-Flight

This plan assumes execution from the worktree at `/Users/cantu/repos/claude-config/.claude/worktrees/scope-tier-memory-check/` on branch `feature/scope-tier-memory-check`. The branch is at commit `11e82b9` (revised spec landed).

If running fresh, verify:

```fish
cd /Users/cantu/repos/claude-config/.claude/worktrees/scope-tier-memory-check
git status                     # should be clean except untracked .claude/state/
git log --oneline -3           # 11e82b9, 049eff7, bf45f33
which jq                       # required by hook script
which shellcheck               # required by Phase 1o
bun --version                  # required by test runner
```

If any tool is missing: install via brew before continuing (`brew install jq shellcheck oven-sh/bun/bun`).

---

## File Structure

**New files:**
- `hooks/scope-tier-memory-check.sh` — mechanical hook (Layer 1)
- `tests/hooks/scope-tier-memory-check.test.sh` — hook unit tests
- `tests/hooks/scope-tier-memory-check-log-rotation.test.sh` — log rotation test
- `bin/install-scope-tier-hook.fish` — idempotent settings.json hook registrar
- `rules-evals/scope-tier-memory-check/evals.json` — 10 evals
- `tests/fixtures/scope-tier-memory-check/README.md` — fixture-to-eval contract
- `tests/fixtures/scope-tier-memory-check/<eval-name>/` — 10 subdirs (one per eval)
- `tests/validate-phase-1o.test.ts` — new validate phase test

**Modified files:**
- `tests/evals-lib.ts` — add optional `additional_context` field to `Eval` and `ValidatedEval`
- `tests/eval-runner-v2.ts` — emit synthetic system-reminder when `additional_context` present
- `tests/evals-lib.test.ts` — add test coverage for the new field
- `validate.fish` — add Phase 1o (hook script presence + executable bit + shellcheck + substrate field) + update Phase 1f/1g/1j registries
- `rules/planning.md` — add `<a id="scope-tier-memory-check"></a>` subsection in step 1
- `rules/README.md` — note Phase 1o coverage
- `tests/validate-phase-1g.test.ts` — extend with new canonical-string registrations
- `tests/validate-phase-1l.test.ts` — no change (no new delegates yet)

**Filed at task 1 (BEFORE implementation begins):**
- GitHub issue: Phase 2 follow-up — scope-tier corpus eval (30-day FP/FN measurement)

---

## Execution Mode Pre-Announcement

Per `rules/execution-mode.md` HARD-GATE, when the implementer of this plan invokes `superpowers:subagent-driven-development`, they MUST announce:

> **[Execution mode: subagent-driven]** Plan: ~17 tasks across 11+ files, ~600-800 LOC of implementation + tests, integration coupling between substrate / hook / eval suite / validate.fish phases. Per-task spec-compliance review pays for itself.

If the user explicitly overrides to single-implementer at execution time, the announcement still goes out per the rule.

---

## Task 1: File Phase 2 Follow-Up Issue (BEFORE Implementation)

Per architectural confidence-assessment recommendation, file the Phase 2 corpus-eval issue NOW so it isn't forgotten after merge.

**Files:** None (GitHub API only)

- [ ] **Step 1: Verify gh CLI authenticated to chriscantu/claude-config**

Run:
```fish
gh auth status
gh repo view chriscantu/claude-config --json name
```
Expected: auth status shows `Logged in to github.com`; repo view returns `{"name":"claude-config"}`.

- [ ] **Step 2: Create the Phase 2 follow-up issue**

Write the issue body to `/tmp/phase2-issue.md`:
```fish
echo '## Problem

The scope-tier memory check (see PR #332 design) ships with 10 canonical
evals but no FP/FN measurement against the real prompt distribution.
This issue tracks the Phase 2 corpus-eval that measures precision /
recall after 30 days of `~/.claude/logs/scope-tier-hook.log` accumulation.

## Acceptance

- Pull 50 prompts from `~/.claude/logs/scope-tier-hook.log` (stratified:
  25 match-decisions, 25 no-match-decisions).
- Manually label each as truly-scope-tier vs truly-needs-pipeline.
- Compute precision (match-positives that were truly scope-tier) and
  recall (truly-scope-tier prompts the hook caught).
- **Thresholds**: precision >= 0.90 (FP rate <= 10% — wrong-tier
  routing is costly), recall >= 0.70 (FN rate <= 30% — partial
  coverage acceptable because Layer 2 rule text + Trivial-tier check
  + memory-discipline still provide backstops).
- If thresholds miss: tune criteria (verb list, blast-radius list,
  git-pre-check thresholds), re-run measurement, document changes
  in this issue.

## Context

- Spec: `docs/superpowers/specs/2026-05-17-scope-tier-memory-check-design.md` — Measurement Plan section
- Source PR: #332 (the design that introduced the hook)
- Log location: `~/.claude/logs/scope-tier-hook.log`
- Cold-start sanity check from rollout step 11 provides T=0 baseline if
  available; this issue picks up at T+30 days.

## Out of Scope

- Phase 3 (tool-use forcing). Only consider if Phase 2 reveals recall < 0.70
  even after criteria tuning. Track as separate follow-up if needed.
' > /tmp/phase2-issue.md

gh issue create \
  --repo chriscantu/claude-config \
  --title "scope-tier hook corpus eval — 30-day FP/FN measurement (Phase 2 of #332)" \
  --label "priority: 2-medium" \
  --label "tracking" \
  --body-file /tmp/phase2-issue.md
```
Expected: `gh issue create` prints the new issue URL.

- [ ] **Step 3: Record the issue number in the plan**

Edit this plan to replace `#???` placeholders with the new issue number throughout. Use grep to find them:
```fish
grep -n '#???' docs/superpowers/plans/2026-05-17-scope-tier-memory-check.md
```
Then run a single `sed -i '' 's/#???/#NNN/g' ...` (replacing NNN with the actual number) over the plan file.

- [ ] **Step 4: Commit the plan edit**

```fish
git add docs/superpowers/plans/2026-05-17-scope-tier-memory-check.md
git commit -m "docs(plan): record Phase 2 issue number #NNN" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Substrate Adaptation — `additional_context` Field

Add an optional `additional_context: string` field to the `Eval` shape so routing-contract evals can inject a synthetic `<system-reminder>` without installing the real bash hook.

**Files:**
- Modify: `tests/evals-lib.ts:88-115` (Eval interface), `tests/evals-lib.ts:129-147` (ValidatedEval type), `tests/evals-lib.ts:500-595` (validation in `loadEvalFile`)
- Modify: `tests/eval-runner-v2.ts` (consumer that builds the claude prompt envelope)
- Test: `tests/evals-lib.test.ts`

- [ ] **Step 1: Write failing tests for the new field in `tests/evals-lib.test.ts`**

Append three tests:

```typescript
import { loadEvalFile } from "./evals-lib.ts";
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("evals-lib additional_context field", () => {
  function withTmpEvalFile(json: object): string {
    const dir = mkdtempSync(join(tmpdir(), "evals-lib-test-"));
    const file = join(dir, "evals.json");
    writeFileSync(file, JSON.stringify(json));
    return file;
  }

  test("accepts string additional_context on single-turn eval", () => {
    const file = withTmpEvalFile({
      skill: "test",
      evals: [{
        name: "with-ctx",
        prompt: "do thing",
        additional_context: "SCOPE-TIER MATCH: foo",
        assertions: [{ type: "contains", value: "ack" }]
      }]
    });
    const result = loadEvalFile(file);
    expect(result.evals[0].kind).toBe("single");
    if (result.evals[0].kind === "single") {
      expect(result.evals[0].additional_context).toBe("SCOPE-TIER MATCH: foo");
    }
  });

  test("rejects non-string additional_context", () => {
    const file = withTmpEvalFile({
      skill: "test",
      evals: [{
        name: "bad-ctx",
        prompt: "do thing",
        additional_context: 42,
        assertions: [{ type: "contains", value: "ack" }]
      }]
    });
    expect(() => loadEvalFile(file)).toThrow(/additional_context.*string/);
  });

  test("absent additional_context preserves current behavior", () => {
    const file = withTmpEvalFile({
      skill: "test",
      evals: [{
        name: "no-ctx",
        prompt: "do thing",
        assertions: [{ type: "contains", value: "ack" }]
      }]
    });
    const result = loadEvalFile(file);
    expect(result.evals[0].kind).toBe("single");
    if (result.evals[0].kind === "single") {
      expect(result.evals[0].additional_context).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:
```fish
bun test tests/evals-lib.test.ts
```
Expected: three new tests fail (interface doesn't have `additional_context` yet, validation doesn't reject non-string).

- [ ] **Step 3: Add `additional_context` to the `Eval` interface**

Edit `tests/evals-lib.ts:88-115`. Add the field after `scratch_decoy`:

```typescript
export interface Eval {
  // ... existing fields ...
  scratch_decoy?: Record<string, string>;
  /** Optional synthetic <system-reminder> string the runner prepends to
   *  the prompt envelope before sending to claude. Lets hook-driven
   *  evals test the model's response to a reminder in isolation, without
   *  requiring the bash hook to be installed in the scratch cwd. Mutually
   *  informative with `setup`: `setup` exercises the real hook
   *  end-to-end; `additional_context` exercises the routing contract in
   *  isolation. Single-turn only (V1 — multi-turn synthetic reminders
   *  out of scope). */
  additional_context?: string;
}
```

- [ ] **Step 4: Add `additional_context` to single-turn `ValidatedEval` discriminated union**

Edit `tests/evals-lib.ts:129-147`. Add to the `kind: "single"` branch:

```typescript
export type ValidatedEval =
  | {
      readonly kind: "single";
      readonly name: string;
      readonly summary?: string;
      readonly prompt: string;
      readonly assertions: readonly ValidatedAssertion[];
      readonly setup?: string;
      readonly teardown?: string;
      readonly scratch_decoy?: ValidatedScratchDecoy;
      readonly additional_context?: string;
    }
  | { /* multi unchanged */ };
```

- [ ] **Step 5: Add validation + assignment in `loadEvalFile`**

Edit `tests/evals-lib.ts:500-595` (single-turn validation branch around line 529 where `prompt: e.prompt!` is set). Add `additional_context` validation BEFORE the single-turn construct call:

```typescript
// Single-turn additional_context validation
let validatedAdditionalContext: string | undefined;
if (e.additional_context !== undefined) {
  if (typeof e.additional_context !== "string") {
    throw new Error(
      `${file}: eval '${e.name}' additional_context must be a string (got ${typeof e.additional_context})`
    );
  }
  validatedAdditionalContext = e.additional_context;
}
```

Then add to the single-turn construct (around line 529):
```typescript
validatedEvals.push({
  kind: "single",
  name: e.name,
  summary: e.summary,
  prompt: e.prompt!,
  assertions: validatedAssertions,
  setup: e.setup,
  teardown: e.teardown,
  scratch_decoy: validatedDecoy,
  additional_context: validatedAdditionalContext,
});
```

- [ ] **Step 6: Run tests to verify pass**

Run:
```fish
bun test tests/evals-lib.test.ts
```
Expected: ALL tests pass (existing + 3 new).

- [ ] **Step 7: Update `tests/eval-runner-v2.ts` to emit the reminder**

Find the prompt-envelope construction (look for where `claude` is spawned with the prompt — `grep -n "spawnClaude\|prompt:\|stdin.write" tests/eval-runner-v2.ts`). Locate the function that builds the user-facing prompt content for single-turn evals.

Add this block BEFORE the prompt is written to stdin:

```typescript
// If the eval declares an additional_context, prepend it as a synthetic
// <system-reminder>. This lets hook-driven evals test the routing
// contract in isolation. Matches the literal format the live Claude
// Code runtime uses for system-reminders (per harness convention).
const promptToSend = eval_.kind === "single" && eval_.additional_context
  ? `<system-reminder>\n${eval_.additional_context}\n</system-reminder>\n\n${eval_.prompt}`
  : eval_.prompt;
```

Then use `promptToSend` where `eval_.prompt` was being passed to claude's stdin.

- [ ] **Step 8: Add an integration test that round-trips through the runner**

Append to `tests/evals-lib.test.ts`:

```typescript
test("runner integration: additional_context appears in prompt envelope", async () => {
  // This is a structural test against the prompt-build function, not a
  // live model call. Import the buildPrompt helper from eval-runner-v2
  // and assert the synthetic system-reminder appears before the prompt.
  const { buildPrompt } = await import("./eval-runner-v2.ts");
  const result = buildPrompt({
    kind: "single",
    name: "t",
    prompt: "do thing",
    additional_context: "SCOPE-TIER MATCH: foo",
    assertions: [],
  } as any);
  expect(result).toContain("<system-reminder>");
  expect(result).toContain("SCOPE-TIER MATCH: foo");
  expect(result).toContain("do thing");
  // Reminder MUST precede prompt
  expect(result.indexOf("SCOPE-TIER MATCH:")).toBeLessThan(result.indexOf("do thing"));
});
```

If `buildPrompt` isn't exported in eval-runner-v2.ts, export it (rename the inline function to a named export). If the prompt assembly is too entangled with spawn logic to factor out cleanly, write the test against the assembled stdin buffer captured via a mocked spawn — but factoring out is preferred.

- [ ] **Step 9: Run all tests**

Run:
```fish
bun test tests/
```
Expected: all tests pass including the runner integration test.

- [ ] **Step 10: Commit**

```fish
git add tests/evals-lib.ts tests/eval-runner-v2.ts tests/evals-lib.test.ts
git commit -m "feat(evals): add optional additional_context field to Eval shape" \
  -m "Lets hook-driven evals inject a synthetic <system-reminder> into" \
  -m "the prompt envelope without requiring the real bash hook to be" \
  -m "installed in the scratch cwd. Backward compatible — absent field" \
  -m "preserves current behavior. Used by scope-tier-memory-check evals" \
  -m "for routing-contract isolation per spec 2026-05-17." \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Hook Script — Skeleton + Sentinel Bypass + MEMORY.md Read

Implement the hook script in TDD order: start with the simplest cases (sentinel, no-memory) and build outward.

**Files:**
- Create: `hooks/scope-tier-memory-check.sh`
- Create: `tests/hooks/scope-tier-memory-check.test.sh`

- [ ] **Step 1: Write failing test — sentinel-bypass project-local**

Create `tests/hooks/scope-tier-memory-check.test.sh`:

```bash
#!/bin/bash
# Hook unit tests. Runs the script via stdin with controlled fixtures.
# Pattern from hooks/test-block-dangerous-git.sh.

set -u

HOOK="$(cd "$(dirname "$0")/../.." && pwd)/hooks/scope-tier-memory-check.sh"
PASS=0
FAIL=0
FAILED_TESTS=()

run_case() {
  local name="$1"
  local stdin_input="$2"
  local expected_stdout="$3"      # substring (empty = no output expected)
  local expected_exit="$4"
  local setup_cmd="${5:-true}"    # optional fixture-setup command
  local cleanup_cmd="${6:-true}"  # optional fixture-cleanup command

  eval "$setup_cmd"
  local actual_stdout actual_exit
  actual_stdout=$(echo "$stdin_input" | bash "$HOOK" 2>&1)
  actual_exit=$?
  eval "$cleanup_cmd"

  local ok=1
  if [[ -n "$expected_stdout" ]] && [[ "$actual_stdout" != *"$expected_stdout"* ]]; then
    ok=0
  fi
  if [[ -z "$expected_stdout" ]] && [[ -n "$actual_stdout" ]]; then
    ok=0
  fi
  if [[ "$actual_exit" -ne "$expected_exit" ]]; then
    ok=0
  fi

  if [[ $ok -eq 1 ]]; then
    PASS=$((PASS+1))
    echo "  PASS: $name"
  else
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name (stdout='$actual_stdout', exit=$actual_exit)")
    echo "  FAIL: $name"
  fi
}

echo "── sentinel bypass"
# Test: project-local DISABLE_PRESSURE_FLOOR sentinel suppresses match
TMPDIR_FIX=$(mktemp -d)
run_case \
  "sentinel-project-local-suppresses" \
  '{"prompt":"prune the dead code in lib/foo.ts"}' \
  "" \
  0 \
  "mkdir -p '$TMPDIR_FIX/.claude' && touch '$TMPDIR_FIX/.claude/DISABLE_PRESSURE_FLOOR' && cd '$TMPDIR_FIX'" \
  "cd - >/dev/null && rm -rf '$TMPDIR_FIX'"

echo
echo "Pass: $PASS, Fail: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  printf '  - %s\n' "${FAILED_TESTS[@]}"
  exit 1
fi
exit 0
```

Make it executable:
```fish
chmod +x tests/hooks/scope-tier-memory-check.test.sh
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```fish
bash tests/hooks/scope-tier-memory-check.test.sh
```
Expected: FAIL because `hooks/scope-tier-memory-check.sh` doesn't exist (or the run produces an error instead of the expected silent exit 0).

- [ ] **Step 3: Create the hook skeleton with sentinel-bypass**

Create `hooks/scope-tier-memory-check.sh`:

```bash
#!/bin/bash
# scope-tier-memory-check.sh
#
# UserPromptSubmit hook that scans the user's prompt + MEMORY.md for
# scope-tier feedback memories and emits a <system-reminder> when the
# prompt matches the conjunctive scope-tier criteria. The model
# responds to the reminder per rules/planning.md
# §scope-tier-memory-check.
#
# Disable: create ~/.claude/DISABLE_PRESSURE_FLOOR or
# .claude/DISABLE_PRESSURE_FLOOR (project-local). File existence
# alone disables; content ignored. Same sentinel as the
# pressure-framing floor — single off-switch for emergency rollback.
#
# Source spec: docs/superpowers/specs/2026-05-17-scope-tier-memory-check-design.md
# Dependencies: bash, jq, grep, awk, git (optional — graceful degrade).

set -u

# ── Sentinel bypass ──────────────────────────────────────────────────
if [[ -f "${HOME}/.claude/DISABLE_PRESSURE_FLOOR" ]] \
  || [[ -f ".claude/DISABLE_PRESSURE_FLOOR" ]]; then
  exit 0
fi

# ── Read input ───────────────────────────────────────────────────────
INPUT=$(cat 2>/dev/null || true)
if [[ -z "$INPUT" ]]; then exit 0; fi

PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || true)
if [[ -z "$PROMPT" ]]; then exit 0; fi

# ── Stub: subsequent steps add MEMORY.md scan + criteria evaluation ──
exit 0
```

Make it executable:
```fish
chmod +x hooks/scope-tier-memory-check.sh
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```fish
bash tests/hooks/scope-tier-memory-check.test.sh
```
Expected: `Pass: 1, Fail: 0`.

- [ ] **Step 5: Add tests for global sentinel + no-memory + missing-prompt cases**

Append to `tests/hooks/scope-tier-memory-check.test.sh` (before the `echo` summary):

```bash
echo "── input validation"
run_case \
  "empty-stdin-graceful-exit" \
  "" \
  "" \
  0

run_case \
  "non-json-stdin-graceful-exit" \
  "not json at all" \
  "" \
  0

run_case \
  "missing-prompt-field-graceful-exit" \
  '{"other":"field"}' \
  "" \
  0

echo "── no scope-tier memory loaded"
# Without a MEMORY.md fixture, the hook should silently exit 0.
TMPDIR_NOMEM=$(mktemp -d)
run_case \
  "no-memory-md-exits-silently" \
  '{"prompt":"prune the dead code in lib/foo.ts"}' \
  "" \
  0 \
  "cd '$TMPDIR_NOMEM'" \
  "cd - >/dev/null && rm -rf '$TMPDIR_NOMEM'"
```

- [ ] **Step 6: Run tests — should all pass with current skeleton**

Run:
```fish
bash tests/hooks/scope-tier-memory-check.test.sh
```
Expected: `Pass: 4, Fail: 0`.

- [ ] **Step 7: Commit**

```fish
git add hooks/scope-tier-memory-check.sh tests/hooks/scope-tier-memory-check.test.sh
git commit -m "feat(hooks): scope-tier hook skeleton + sentinel bypass" \
  -m "Initial scaffold: sentinel-bypass check, stdin validation, graceful" \
  -m "no-op on missing/malformed input. Subsequent commits add MEMORY.md" \
  -m "scan + 6 conjunctive criteria + log + rotation per spec 2026-05-17." \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Hook Script — MEMORY.md Scan + Scope-Tier Keyword List

Add MEMORY.md discovery and scope-tier feedback memory detection.

**Files:**
- Modify: `hooks/scope-tier-memory-check.sh`
- Modify: `tests/hooks/scope-tier-memory-check.test.sh`

- [ ] **Step 1: Write failing tests for MEMORY.md scan**

Append to test file:

```bash
echo "── MEMORY.md scope-tier detection"
TMPDIR_MEM=$(mktemp -d)
mkdir -p "$TMPDIR_MEM/.claude/projects/-Users-cantu-repos-claude-config/memory"

# Fixture: MEMORY.md WITH a scope-tier entry
cat > "$TMPDIR_MEM/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md" <<'EOF'
# Memory Index

- [Right-size ceremony](feedback_right_size_ceremony.md) — Right-size pipeline ceremony to feature size: small/mechanical changes should skip DTP/SA/brainstorm/FMS; reserve for ambiguous or high-blast-radius work
- [Other memory](other.md) — Some other thing
EOF

# At this stage, the hook ONLY detects the memory — full criteria evaluation
# comes in Task 5. So a positive-match prompt with scope-tier memory still
# exits 0 (no SCOPE-TIER MATCH: emission) UNTIL Task 5 lands.
# This test asserts the hook reads MEMORY.md without crashing.
run_case \
  "memory-md-readable-no-crash" \
  '{"prompt":"prune lib/foo.ts"}' \
  "" \
  0 \
  "cd '$TMPDIR_MEM' && export CLAUDE_PROJECT_DIR='$TMPDIR_MEM'" \
  "cd - >/dev/null && unset CLAUDE_PROJECT_DIR && rm -rf '$TMPDIR_MEM'"

# Fixture: MEMORY.md with NO scope-tier entry
TMPDIR_NOSCOPE=$(mktemp -d)
mkdir -p "$TMPDIR_NOSCOPE/.claude/projects/-Users-cantu-repos-claude-config/memory"
cat > "$TMPDIR_NOSCOPE/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md" <<'EOF'
# Memory Index

- [Other memory](other.md) — Some unrelated thing
EOF
run_case \
  "memory-md-no-scope-tier-keyword-exits-silently" \
  '{"prompt":"prune lib/foo.ts"}' \
  "" \
  0 \
  "cd '$TMPDIR_NOSCOPE' && export CLAUDE_PROJECT_DIR='$TMPDIR_NOSCOPE'" \
  "cd - >/dev/null && unset CLAUDE_PROJECT_DIR && rm -rf '$TMPDIR_NOSCOPE'"
```

- [ ] **Step 2: Run tests to verify they pass (current stub exits 0 for everything)**

Run:
```fish
bash tests/hooks/scope-tier-memory-check.test.sh
```
Expected: `Pass: 6, Fail: 0` (skeleton already exits 0 — but we now have a fixture wired up for the next task).

- [ ] **Step 3: Add MEMORY.md discovery + scope-tier scan to the hook**

Edit `hooks/scope-tier-memory-check.sh`. Add the canonical keyword list and the scan AFTER the input-read block (before the existing `exit 0`):

```bash
# ── Canonical keyword lists (Phase 1g validates restatement elsewhere) ─
SCOPE_TIER_MEMORY_KEYWORDS=(
  "right-size"
  "small/mechanical"
  "skip DTP"
  "skip SA"
  "ceremony"
  "scope tier"
)

# ── MEMORY.md discovery ──────────────────────────────────────────────
discover_memory_md() {
  local candidates=(
    "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md"
    "${HOME}/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md"
  )
  for c in "${candidates[@]}"; do
    if [[ -r "$c" ]]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

MEMORY_PATH=$(discover_memory_md) || exit 0

# ── Scope-tier memory detection ──────────────────────────────────────
# Match a memory entry line (markdown list item) whose description
# contains any scope-tier keyword. Capture all matching memory names
# (typically just one) for the eventual emission.
MATCHED_MEMORIES=()
while IFS= read -r line; do
  for kw in "${SCOPE_TIER_MEMORY_KEYWORDS[@]}"; do
    if [[ "$line" == *"$kw"* ]]; then
      # Extract the memory name from markdown link syntax: - [Name](file.md) — desc
      # Match the bracketed display text or the parenthesized filename
      memory_name=$(echo "$line" | sed -nE 's/.*\[([^]]+)\].*/\1/p')
      if [[ -z "$memory_name" ]]; then
        memory_name=$(echo "$line" | sed -nE 's/.*\(([^)]+)\.md\).*/\1/p')
      fi
      if [[ -n "$memory_name" ]]; then
        MATCHED_MEMORIES+=("$memory_name")
      fi
      break
    fi
  done
done < "$MEMORY_PATH"

if [[ ${#MATCHED_MEMORIES[@]} -eq 0 ]]; then
  exit 0
fi

# At this point: at least one scope-tier memory is loaded.
# Task 5 adds the conjunctive prompt criteria.
exit 0
```

- [ ] **Step 4: Run tests to verify they still pass**

Run:
```fish
bash tests/hooks/scope-tier-memory-check.test.sh
```
Expected: `Pass: 6, Fail: 0`.

- [ ] **Step 5: Run shellcheck on the hook**

Run:
```fish
shellcheck hooks/scope-tier-memory-check.sh
```
Expected: zero warnings. Fix any that arise (most likely SC2155 — declare/assign separately).

- [ ] **Step 6: Commit**

```fish
git add hooks/scope-tier-memory-check.sh tests/hooks/scope-tier-memory-check.test.sh
git commit -m "feat(hooks): scope-tier MEMORY.md scan + keyword detection" \
  -m "Adds canonical scope-tier keyword list (Phase 1g enforced) and" \
  -m "MEMORY.md discovery (CLAUDE_PROJECT_DIR → \$HOME fallback). Hook" \
  -m "now reaches the gate where conjunctive prompt criteria evaluate;" \
  -m "next commit adds those criteria." \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Hook Script — Six Conjunctive Criteria + Emission

Add the six conjunctive prompt criteria + `additionalContext` JSON emission on match.

**Files:**
- Modify: `hooks/scope-tier-memory-check.sh`
- Modify: `tests/hooks/scope-tier-memory-check.test.sh`

- [ ] **Step 1: Write failing tests for each criterion**

Append to test file:

```bash
echo "── Conjunctive criteria"

setup_memory_fixture() {
  local dir="$1"
  mkdir -p "$dir/.claude/projects/-Users-cantu-repos-claude-config/memory"
  cat > "$dir/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md" <<'EOF'
# Memory Index
- [feedback_right_size_ceremony](feedback_right_size_ceremony.md) — Right-size pipeline ceremony to feature size: small/mechanical changes should skip DTP/SA/brainstorm/FMS
EOF
}

# Positive case: all criteria pass → SCOPE-TIER MATCH: emitted
TMPDIR_POS=$(mktemp -d)
run_case \
  "all-criteria-pass-emits-match" \
  '{"prompt":"prune the dead block in rules/planning.md"}' \
  "SCOPE-TIER MATCH:" \
  0 \
  "setup_memory_fixture '$TMPDIR_POS' && cd '$TMPDIR_POS' && export CLAUDE_PROJECT_DIR='$TMPDIR_POS'" \
  "cd - >/dev/null && unset CLAUDE_PROJECT_DIR && rm -rf '$TMPDIR_POS'"

# Negative: verb missing → no emission
TMPDIR_NV=$(mktemp -d)
run_case \
  "no-mechanical-verb-no-match" \
  '{"prompt":"think about the dead block in rules/planning.md"}' \
  "" \
  0 \
  "setup_memory_fixture '$TMPDIR_NV' && cd '$TMPDIR_NV' && export CLAUDE_PROJECT_DIR='$TMPDIR_NV'" \
  "cd - >/dev/null && unset CLAUDE_PROJECT_DIR && rm -rf '$TMPDIR_NV'"

# Negative: minimizer present → no emission
TMPDIR_MIN=$(mktemp -d)
run_case \
  "minimizer-present-no-match" \
  '{"prompt":"just prune the dead block in rules/planning.md, small change"}' \
  "" \
  0 \
  "setup_memory_fixture '$TMPDIR_MIN' && cd '$TMPDIR_MIN' && export CLAUDE_PROJECT_DIR='$TMPDIR_MIN'" \
  "cd - >/dev/null && unset CLAUDE_PROJECT_DIR && rm -rf '$TMPDIR_MIN'"

# Negative: scope-expander present → no emission
TMPDIR_SE=$(mktemp -d)
run_case \
  "scope-expander-present-no-match" \
  '{"prompt":"rearchitect the front-door across rules/planning.md"}' \
  "" \
  0 \
  "setup_memory_fixture '$TMPDIR_SE' && cd '$TMPDIR_SE' && export CLAUDE_PROJECT_DIR='$TMPDIR_SE'" \
  "cd - >/dev/null && unset CLAUDE_PROJECT_DIR && rm -rf '$TMPDIR_SE'"

# Negative: blast-radius word present → no emission
TMPDIR_BR=$(mktemp -d)
run_case \
  "blast-radius-public-api-no-match" \
  '{"prompt":"rename the exported serializePayload in api/v1/checkout.ts"}' \
  "" \
  0 \
  "setup_memory_fixture '$TMPDIR_BR' && cd '$TMPDIR_BR' && export CLAUDE_PROJECT_DIR='$TMPDIR_BR'" \
  "cd - >/dev/null && unset CLAUDE_PROJECT_DIR && rm -rf '$TMPDIR_BR'"

# Negative: no concrete target (bare verb) → no emission
TMPDIR_NT=$(mktemp -d)
run_case \
  "no-concrete-target-no-match" \
  '{"prompt":"prune things"}' \
  "" \
  0 \
  "setup_memory_fixture '$TMPDIR_NT' && cd '$TMPDIR_NT' && export CLAUDE_PROJECT_DIR='$TMPDIR_NT'" \
  "cd - >/dev/null && unset CLAUDE_PROJECT_DIR && rm -rf '$TMPDIR_NT'"
```

- [ ] **Step 2: Run tests to verify failures**

Run:
```fish
bash tests/hooks/scope-tier-memory-check.test.sh
```
Expected: the positive-case test fails (no emission yet); negative cases pass trivially (still exit 0).

- [ ] **Step 3: Implement criteria + emission**

Replace the trailing `exit 0` in `hooks/scope-tier-memory-check.sh` with the full criteria evaluation. Insert ABOVE the trailing `exit 0`:

```bash
# ── Canonical criteria lists ─────────────────────────────────────────
VERB_SIGNALS=(
  "prune" "rename" "delete" "trim" "swap" "move"
  "typo" "comment-only" "format-only"
  "add row to" "update entry in" "remove from"
)

MINIMIZERS=(
  "just" "quick" "tiny" "trivial" "small change" "simple"
)

SCOPE_EXPANDERS=(
  "redesign" "restructure" "rearchitect"
  "refactor across" "migrate to" "rewrite"
  "introduce new" "cross-cutting change"
)

BLAST_RADIUS_PATHS=(
  "migrations/" "schema." "*.sql" "*.proto"
  "api/" "routes/" "controllers/"
  "*.d.ts" "index.ts"
)

BLAST_RADIUS_WORDS=(
  "public API" "exported" "breaking change"
  "version bump" "release" "deploy"
)

# Case-insensitive substring check helper.
prompt_contains_any() {
  local needle_array_name="$1[@]"
  local prompt_lower="${PROMPT,,}"
  for needle in "${!needle_array_name}"; do
    local needle_lower="${needle,,}"
    if [[ "$prompt_lower" == *"$needle_lower"* ]]; then
      return 0
    fi
  done
  return 1
}

# Concrete target heuristic: file path with extension, backtick symbol,
# `line N`, or registry entry (single word followed by file extension).
prompt_has_concrete_target() {
  if echo "$PROMPT" | grep -qE '[A-Za-z0-9_./-]+\.(md|ts|js|sh|fish|json|toml|yaml|yml|py|go|rs|java|kt|swift)\b'; then
    return 0
  fi
  if echo "$PROMPT" | grep -qE '`[^`]+`'; then
    return 0
  fi
  if echo "$PROMPT" | grep -qiE '\bline [0-9]+\b'; then
    return 0
  fi
  return 1
}

# ── Apply criteria ───────────────────────────────────────────────────
HAS_VERB=false
HAS_TARGET=false
HAS_MINIMIZER=false
HAS_SCOPE_EXPANDER=false
HAS_BLAST_PATH=false
HAS_BLAST_WORD=false

if prompt_contains_any VERB_SIGNALS; then HAS_VERB=true; fi
if prompt_has_concrete_target; then HAS_TARGET=true; fi
if prompt_contains_any MINIMIZERS; then HAS_MINIMIZER=true; fi
if prompt_contains_any SCOPE_EXPANDERS; then HAS_SCOPE_EXPANDER=true; fi
if prompt_contains_any BLAST_RADIUS_PATHS; then HAS_BLAST_PATH=true; fi
if prompt_contains_any BLAST_RADIUS_WORDS; then HAS_BLAST_WORD=true; fi

# Conjunctive match: all 4 of the present-criteria-side hold
if [[ "$HAS_VERB" != "true" ]] \
  || [[ "$HAS_TARGET" != "true" ]] \
  || [[ "$HAS_MINIMIZER" == "true" ]] \
  || [[ "$HAS_SCOPE_EXPANDER" == "true" ]] \
  || [[ "$HAS_BLAST_PATH" == "true" ]] \
  || [[ "$HAS_BLAST_WORD" == "true" ]]; then
  exit 0
fi

# Task 6 adds the git working-tree pre-check here.

# ── Emit additionalContext ───────────────────────────────────────────
memory_list=$(IFS=, ; echo "${MATCHED_MEMORIES[*]}")
jq -n --arg mems "$memory_list" '{
  additionalContext: ("SCOPE-TIER MATCH: " + $mems +
    ". Per stored feedback, this prompt qualifies as small/mechanical/known-approach. " +
    "Route to direct implementation: skip DTP, Systems Analysis, brainstorming, " +
    "Fat Marker Sketch, and subagent-driven-development. execution-mode.md " +
    "single-implementer mode, goal-driven.md per-step verify checks, and " +
    "verification.md end-of-work gate STILL apply. If this match is wrong, " +
    "the user can re-prompt with explicit pipeline-invocation language (e.g., " +
    "this needs full planning).")
}'
exit 0
```

- [ ] **Step 4: Run tests to verify all pass**

Run:
```fish
bash tests/hooks/scope-tier-memory-check.test.sh
```
Expected: `Pass: 12, Fail: 0`. If a test fails, inspect the prompt and the criteria — most likely a substring leak (e.g., `release` triggers blast-radius on a non-release prompt).

- [ ] **Step 5: Shellcheck pass**

Run:
```fish
shellcheck hooks/scope-tier-memory-check.sh
```
Expected: clean. Fix any warnings (likely SC2076 on `[[ == ]]` quoted patterns — bash treats RHS as literal when quoted, which is what we want).

- [ ] **Step 6: Commit**

```fish
git add hooks/scope-tier-memory-check.sh tests/hooks/scope-tier-memory-check.test.sh
git commit -m "feat(hooks): scope-tier 6-criteria conjunctive evaluation + emission" \
  -m "Implements all six criteria from spec 2026-05-17 (verb, target," \
  -m "minimizer absence, scope-expander absence, blast-radius absence)" \
  -m "EXCEPT criterion 6 (git working-tree pre-check) which lands in the" \
  -m "next commit. Emits additionalContext JSON on full conjunctive match." \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Hook Script — Git Working-Tree Pre-Check (Criterion 6)

Add the sixth criterion: reject match when in-flight git changes exceed thresholds.

**Files:**
- Modify: `hooks/scope-tier-memory-check.sh`
- Modify: `tests/hooks/scope-tier-memory-check.test.sh`

- [ ] **Step 1: Write failing tests for git pre-check**

Append to test file:

```bash
echo "── Git working-tree pre-check"

setup_git_with_n_files() {
  local dir="$1"
  local n="$2"
  setup_memory_fixture "$dir"
  cd "$dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test"
  for i in $(seq 1 "$n"); do
    echo "content$i" > "file$i.txt"
  done
  git add -N "file"*.txt
  cd - >/dev/null
}

# > 5 files in flight → reject
TMPDIR_G1=$(mktemp -d)
run_case \
  "git-many-files-in-flight-no-match" \
  '{"prompt":"prune the dead block in rules/planning.md"}' \
  "" \
  0 \
  "setup_git_with_n_files '$TMPDIR_G1' 8 && cd '$TMPDIR_G1' && export CLAUDE_PROJECT_DIR='$TMPDIR_G1'" \
  "cd - >/dev/null && unset CLAUDE_PROJECT_DIR && rm -rf '$TMPDIR_G1'"

# 3 files in flight → no rejection
TMPDIR_G2=$(mktemp -d)
run_case \
  "git-few-files-in-flight-still-matches" \
  '{"prompt":"prune the dead block in rules/planning.md"}' \
  "SCOPE-TIER MATCH:" \
  0 \
  "setup_git_with_n_files '$TMPDIR_G2' 3 && cd '$TMPDIR_G2' && export CLAUDE_PROJECT_DIR='$TMPDIR_G2'" \
  "cd - >/dev/null && unset CLAUDE_PROJECT_DIR && rm -rf '$TMPDIR_G2'"

# Not in git repo → no rejection
TMPDIR_G3=$(mktemp -d)
run_case \
  "not-in-git-repo-still-matches" \
  '{"prompt":"prune the dead block in rules/planning.md"}' \
  "SCOPE-TIER MATCH:" \
  0 \
  "setup_memory_fixture '$TMPDIR_G3' && cd '$TMPDIR_G3' && export CLAUDE_PROJECT_DIR='$TMPDIR_G3'" \
  "cd - >/dev/null && unset CLAUDE_PROJECT_DIR && rm -rf '$TMPDIR_G3'"

# migrations/ path in flight → reject
TMPDIR_G4=$(mktemp -d)
setup_git_migrations() {
  local dir="$1"
  setup_memory_fixture "$dir"
  cd "$dir"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test"
  mkdir -p migrations
  echo "sql" > migrations/0001.sql
  git add -N migrations/0001.sql
  cd - >/dev/null
}
run_case \
  "git-migrations-path-in-flight-no-match" \
  '{"prompt":"prune the dead block in rules/planning.md"}' \
  "" \
  0 \
  "setup_git_migrations '$TMPDIR_G4' && cd '$TMPDIR_G4' && export CLAUDE_PROJECT_DIR='$TMPDIR_G4'" \
  "cd - >/dev/null && unset CLAUDE_PROJECT_DIR && rm -rf '$TMPDIR_G4'"
```

- [ ] **Step 2: Run tests — first two should fail (criterion not implemented yet), other two pass trivially**

Run:
```fish
bash tests/hooks/scope-tier-memory-check.test.sh
```
Expected: `git-many-files-in-flight-no-match` fails (still emits MATCH); `git-migrations-path-in-flight-no-match` fails (still emits MATCH); others pass.

- [ ] **Step 3: Implement criterion 6 in the hook**

Edit `hooks/scope-tier-memory-check.sh`. Replace the comment `# Task 6 adds the git working-tree pre-check here.` with:

```bash
# ── Criterion 6: git working-tree pre-check ──────────────────────────
# Bounded by `timeout 2s` so a pathological repo can't stall the hook.
# Not in a git repo / git missing / hang → no rejection (graceful).
git_check_rejects() {
  if ! command -v git >/dev/null 2>&1; then
    return 1
  fi
  if ! timeout 2s git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 1
  fi
  local cached_stat unstaged_stat combined
  cached_stat=$(timeout 2s git diff --cached --stat 2>/dev/null || true)
  unstaged_stat=$(timeout 2s git diff --stat 2>/dev/null || true)
  combined=$(printf '%s\n%s' "$cached_stat" "$unstaged_stat")
  # Reject on sensitive path in flight
  if echo "$combined" | grep -qE '(^|/)(migrations|schema|db|api)/'; then
    return 0
  fi
  # Reject on > 5 files
  local file_count
  file_count=$(echo "$combined" | grep -cE '\| +[0-9]+ ' || true)
  if [[ "$file_count" -gt 5 ]]; then
    return 0
  fi
  # Reject on > 200 LOC (sum of `+`/`-` counts in summary line)
  local loc_total
  loc_total=$(echo "$combined" \
    | grep -E '[0-9]+ insertion|[0-9]+ deletion' \
    | awk '{
        for (i=1;i<=NF;i++) {
          if ($i ~ /insertion/ || $i ~ /deletion/) sum += $(i-1)
        }
      } END { print sum+0 }')
  if [[ "$loc_total" -gt 200 ]]; then
    return 0
  fi
  return 1
}

if git_check_rejects; then
  exit 0
fi
```

- [ ] **Step 4: Run tests to verify pass**

Run:
```fish
bash tests/hooks/scope-tier-memory-check.test.sh
```
Expected: all 16 tests pass.

- [ ] **Step 5: Shellcheck pass**

Run:
```fish
shellcheck hooks/scope-tier-memory-check.sh
```
Expected: clean.

- [ ] **Step 6: Commit**

```fish
git add hooks/scope-tier-memory-check.sh tests/hooks/scope-tier-memory-check.test.sh
git commit -m "feat(hooks): scope-tier criterion 6 — git working-tree pre-check" \
  -m "Adds bounded (timeout 2s) git diff inspection: reject match if" \
  -m "> 5 files in flight OR > 200 LOC OR migrations/schema/db/api/ path" \
  -m "in flight. Graceful: not-in-git / git-missing / hang → no rejection." \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Hook Script — Log Rotation

Add per-criterion logging + 10 MB rotation.

**Files:**
- Modify: `hooks/scope-tier-memory-check.sh`
- Create: `tests/hooks/scope-tier-memory-check-log-rotation.test.sh`

- [ ] **Step 1: Write failing test for log rotation**

Create `tests/hooks/scope-tier-memory-check-log-rotation.test.sh`:

```bash
#!/bin/bash
set -u

HOOK="$(cd "$(dirname "$0")/../.." && pwd)/hooks/scope-tier-memory-check.sh"
TMP_LOG_DIR=$(mktemp -d)
export SCOPE_TIER_LOG_DIR="$TMP_LOG_DIR"
LOG_FILE="$TMP_LOG_DIR/scope-tier-hook.log"
ROTATED="$TMP_LOG_DIR/scope-tier-hook.log.1"

cleanup() { rm -rf "$TMP_LOG_DIR"; }
trap cleanup EXIT

# Run hook once to ensure file is created
echo '{"prompt":"prune lib/foo.ts"}' | bash "$HOOK" >/dev/null 2>&1

if [[ ! -f "$LOG_FILE" ]]; then
  echo "FAIL: log file not created at $LOG_FILE"
  exit 1
fi

# Fabricate a 11 MB log file (just over threshold)
dd if=/dev/zero of="$LOG_FILE" bs=1M count=11 2>/dev/null

# Run hook again — should trigger rotation
echo '{"prompt":"prune lib/foo.ts"}' | bash "$HOOK" >/dev/null 2>&1

if [[ ! -f "$ROTATED" ]]; then
  echo "FAIL: log not rotated to .log.1"
  exit 1
fi

# Live log should now be smaller
new_size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE")
if [[ "$new_size" -gt 5242880 ]]; then  # 5 MB
  echo "FAIL: live log $new_size bytes; expected ≤ 5 MB after rotation"
  exit 1
fi

echo "PASS: log rotation triggers above 10 MB threshold"
exit 0
```

Make it executable:
```fish
chmod +x tests/hooks/scope-tier-memory-check-log-rotation.test.sh
```

- [ ] **Step 2: Run the test to verify failure**

Run:
```fish
bash tests/hooks/scope-tier-memory-check-log-rotation.test.sh
```
Expected: FAIL (no logging yet — log file doesn't exist).

- [ ] **Step 3: Add logging + rotation to the hook**

Edit `hooks/scope-tier-memory-check.sh`. After the sentinel-bypass block, add:

```bash
# ── Log path (overridable for tests via $SCOPE_TIER_LOG_DIR) ─────────
LOG_DIR="${SCOPE_TIER_LOG_DIR:-${HOME}/.claude/logs}"
LOG_FILE="$LOG_DIR/scope-tier-hook.log"
LOG_ROTATED="$LOG_FILE.1"
LOG_THRESHOLD=$((10 * 1024 * 1024))  # 10 MB
LOG_KEEP_TAIL=$((5 * 1024 * 1024))   # rotate keeps last 5 MB

mkdir -p "$LOG_DIR" 2>/dev/null || true

rotate_log_if_needed() {
  if [[ ! -f "$LOG_FILE" ]]; then return 0; fi
  local size
  size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
  if [[ "$size" -gt "$LOG_THRESHOLD" ]]; then
    # Keep last 5 MB in .log.1, start fresh
    tail -c "$LOG_KEEP_TAIL" "$LOG_FILE" > "$LOG_ROTATED" 2>/dev/null || true
    : > "$LOG_FILE"
  fi
}

log_decision() {
  local decision="$1"
  rotate_log_if_needed
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local prompt_hash
  prompt_hash=$(printf '%s' "$PROMPT" | shasum -a 256 2>/dev/null | awk '{print substr($1,1,16)}')
  jq -n -c \
    --arg ts "$ts" \
    --arg decision "$decision" \
    --arg prompt_hash "$prompt_hash" \
    --arg has_verb "$HAS_VERB" \
    --arg has_target "$HAS_TARGET" \
    --arg has_minimizer "$HAS_MINIMIZER" \
    --arg has_scope_exp "$HAS_SCOPE_EXPANDER" \
    --arg has_blast_path "$HAS_BLAST_PATH" \
    --arg has_blast_word "$HAS_BLAST_WORD" \
    --argjson matched_memories "$(printf '%s\n' "${MATCHED_MEMORIES[@]:-}" | jq -R . | jq -s .)" \
    '{ts: $ts, decision: $decision, prompt_hash: $prompt_hash,
      criteria: {verb: $has_verb, target: $has_target, minimizer_absent: ($has_minimizer == "false"),
                 scope_expander_absent: ($has_scope_exp == "false"),
                 blast_path_absent: ($has_blast_path == "false"),
                 blast_word_absent: ($has_blast_word == "false")},
      matched_memories: $matched_memories}' \
    >> "$LOG_FILE" 2>/dev/null || true
}
```

Then add `log_decision "no_match"` calls at each early-exit point in the criteria-evaluation block, AND `log_decision "match"` immediately before the jq emission. (For the early exits in sentinel-bypass / no-memory paths, skip logging — those happen before the criteria variables exist.)

The simplest implementation: at the no-memory `exit 0`, log with `decision="no_scope_tier_memory"`. After all criteria variables are populated, log either `"match"` or `"no_match"`. After git pre-check rejection, log `"no_match_git"`.

- [ ] **Step 4: Run rotation test + main test suite**

Run:
```fish
bash tests/hooks/scope-tier-memory-check-log-rotation.test.sh
bash tests/hooks/scope-tier-memory-check.test.sh
```
Expected: rotation test PASSes; main suite still `Pass: 16, Fail: 0`.

- [ ] **Step 5: Shellcheck pass**

Run:
```fish
shellcheck hooks/scope-tier-memory-check.sh
```
Expected: clean.

- [ ] **Step 6: Commit**

```fish
git add hooks/scope-tier-memory-check.sh tests/hooks/scope-tier-memory-check-log-rotation.test.sh
git commit -m "feat(hooks): scope-tier per-criterion log + 10MB rotation" \
  -m "Newline-delimited JSON log at ~/.claude/logs/scope-tier-hook.log" \
  -m "(overridable via SCOPE_TIER_LOG_DIR). Each entry records the" \
  -m "match decision + per-criterion result + 16-char prompt hash for" \
  -m "Phase 2 corpus eval. Rotates at 10 MB, keeping last 5 MB in .log.1." \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Installer — `bin/install-scope-tier-hook.fish`

Idempotent fish installer that registers the hook in `~/.claude/settings.json`.

**Files:**
- Create: `bin/install-scope-tier-hook.fish`

- [ ] **Step 1: Write the installer**

Create `bin/install-scope-tier-hook.fish`:

```fish
#!/usr/bin/env fish
# install-scope-tier-hook.fish
#
# Idempotent installer for the scope-tier UserPromptSubmit hook.
# Adds an entry to ~/.claude/settings.json without clobbering other
# hooks. Re-run safely to fix drift.
#
# Usage:
#   fish bin/install-scope-tier-hook.fish           # install
#   fish bin/install-scope-tier-hook.fish --check   # check registration; exit 1 if missing
#   fish bin/install-scope-tier-hook.fish --remove  # remove registration

set -l repo_root (cd (dirname (status filename))/..; and pwd)
set -l hook_path "$repo_root/hooks/scope-tier-memory-check.sh"
set -l settings "$HOME/.claude/settings.json"

if not test -x "$hook_path"
    echo "Error: hook script not executable at $hook_path" >&2
    exit 2
end

if not test -f "$settings"
    echo "{}" > "$settings"
end

set -l mode "install"
if test (count $argv) -gt 0
    switch $argv[1]
        case --check
            set mode "check"
        case --remove
            set mode "remove"
        case '*'
            echo "Unknown flag: $argv[1]" >&2
            exit 2
    end
end

switch $mode
    case check
        if jq -e --arg p "$hook_path" \
            '.hooks.UserPromptSubmit // [] | any(.hooks // [] | any(.command == $p))' \
            "$settings" >/dev/null 2>&1
            echo "Hook registered"
            exit 0
        else
            echo "Hook NOT registered in $settings" >&2
            exit 1
        end
    case remove
        set -l tmp (mktemp)
        jq --arg p "$hook_path" '
            if .hooks.UserPromptSubmit then
                .hooks.UserPromptSubmit |= map(
                    .hooks |= map(select(.command != $p))
                ) | .hooks.UserPromptSubmit |= map(select((.hooks // []) | length > 0))
            else . end
        ' "$settings" > "$tmp"; and mv "$tmp" "$settings"
        echo "Hook removed (if present)"
        exit 0
    case install
        set -l tmp (mktemp)
        jq --arg p "$hook_path" '
            .hooks //= {}
            | .hooks.UserPromptSubmit //= []
            | if (.hooks.UserPromptSubmit | any(.hooks // [] | any(.command == $p))) then .
              else .hooks.UserPromptSubmit += [{hooks: [{type: "command", command: $p}]}] end
        ' "$settings" > "$tmp"; and mv "$tmp" "$settings"
        echo "Hook installed at $hook_path"
        echo "Verify: fish $repo_root/bin/install-scope-tier-hook.fish --check"
        exit 0
end
```

Make it executable:
```fish
chmod +x bin/install-scope-tier-hook.fish
```

- [ ] **Step 2: Test the installer manually**

Run:
```fish
# Snapshot current settings.json
cp ~/.claude/settings.json /tmp/settings.json.snap

# Install
fish bin/install-scope-tier-hook.fish

# Check
fish bin/install-scope-tier-hook.fish --check
# Expected: "Hook registered", exit 0

# Verify settings.json structure
jq '.hooks.UserPromptSubmit' ~/.claude/settings.json
# Expected: array containing object with hooks: [{type: "command", command: "<absolute path to hook>"}]

# Idempotent — second install should be a no-op
fish bin/install-scope-tier-hook.fish
jq '.hooks.UserPromptSubmit | length' ~/.claude/settings.json
# Expected: 1

# Remove
fish bin/install-scope-tier-hook.fish --remove
fish bin/install-scope-tier-hook.fish --check
# Expected: "Hook NOT registered", exit 1

# Restore original settings
cp /tmp/settings.json.snap ~/.claude/settings.json
```

If any step diverges from expected, fix the installer and re-run.

- [ ] **Step 3: Commit**

```fish
git add bin/install-scope-tier-hook.fish
git commit -m "feat(installer): idempotent scope-tier hook installer" \
  -m "fish bin/install-scope-tier-hook.fish — adds the UserPromptSubmit" \
  -m "hook to ~/.claude/settings.json without clobbering existing hooks." \
  -m "Supports --check (CI) and --remove (uninstall)." \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `rules/planning.md` Subsection (Layer 2)

Add the routing-contract subsection to step 1 of `planning.md`.

**Files:**
- Modify: `rules/planning.md`

- [ ] **Step 1: Locate the insertion point**

Run:
```fish
grep -n 'id="pressure-framing-floor"\|id="emergency-bypass-sentinel"\|id="architectural-invariant"\|id="emission-contract"\|id="skip-contract"' rules/planning.md
```
Note the line numbers. The new subsection inserts BEFORE the `<a id="pressure-framing-floor">` block.

- [ ] **Step 2: Insert the new subsection**

Open `rules/planning.md`. Above the `<a id="pressure-framing-floor"></a>` line, insert:

```markdown

   <a id="scope-tier-memory-check"></a>
   **Scope-tier memory check (fires BEFORE pressure-framing floor).** A
   `UserPromptSubmit` hook (`hooks/scope-tier-memory-check.sh`) inspects
   every prompt against loaded scope-tier `feedback` memories. When the
   hook detects a match, it injects a `<system-reminder>` beginning with
   the literal prefix `SCOPE-TIER MATCH:`.

   When you receive a `SCOPE-TIER MATCH:` system-reminder:

   1. Acknowledge the match in one visible line:
      `[Scope-tier match: <memory-name>] Routing to direct implementation per stored feedback.`
   2. Route to direct implementation. Skip DTP, Systems Analysis,
      brainstorming, Fat Marker Sketch, and subagent-driven-development.
   3. `execution-mode.md` single-implementer mode, `goal-driven.md`
      per-step verify checks, and `verification.md` end-of-work gate
      STILL apply.

   If you believe the hook fired incorrectly (e.g., the prompt actually
   does require the pipeline), name the specific signal that's wrong and
   ask the user before proceeding: *"Hook fired SCOPE-TIER MATCH on X,
   but Y suggests this needs pipeline. Confirm direct implementation or
   invoke pipeline?"*

   When NO `SCOPE-TIER MATCH:` reminder is present, proceed to the
   pressure-framing floor below (current behavior unchanged).

   **Hook absence is graceful degradation.** If the hook is not
   installed (no `UserPromptSubmit` entry in `~/.claude/settings.json`),
   no reminder fires; the rest of this section's gates evaluate
   normally. The Layer 2 rule text alone is a soft check — the
   structural guarantee comes from Layer 1. Install via
   `fish bin/install-scope-tier-hook.fish`.

   **Sentinel bypass inheritance.** The hook checks the
   `DISABLE_PRESSURE_FLOOR` sentinel before evaluating criteria. When
   the sentinel is present (project-local OR global), the hook exits 0
   (no reminder). Same off-switch as pressure-framing floor and
   Trivial-tier four-criteria check — single flag for emergency
   rollback.

   **Precedence vs Trivial/Mechanical tier.** Scope-tier hook match is
   a fast-path into the same destination as Trivial tier (skip
   DTP/SA/brainstorm/FMS, single-implementer mode). On match, jump
   straight to direct implementation; Trivial-tier four-criteria
   check remains the fallback for prompts WITHOUT a hook match but
   WITH all four criteria satisfiable. Both routes converge.

   **Precedence vs Expert Fast-Track.** Hook match wins; Fast-Track
   still runs DTP (condensed), which scope-tier match skips entirely.

```

- [ ] **Step 3: Verify rule still parses (run validate.fish)**

Run:
```fish
fish validate.fish 2>&1 | tail -20
```
Expected: pass (Phase 1f/1g/1j updates haven't landed yet — but they're additive, so the current validate run should still pass unless an anchor regex breaks).

- [ ] **Step 4: Commit**

```fish
git add rules/planning.md
git commit -m "feat(rules): scope-tier-memory-check subsection in planning.md step 1" \
  -m "Layer 2 of the two-layer scope-tier design — governs how the" \
  -m "model responds to a SCOPE-TIER MATCH: <system-reminder> emitted" \
  -m "by the Layer 1 hook (hooks/scope-tier-memory-check.sh). Anchor:" \
  -m "#scope-tier-memory-check (added to Phase 1j registry in next commit)." \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `validate.fish` — Phases 1f / 1g / 1j Registry Updates

Register the new anchor + canonical-string lists + label.

**Files:**
- Modify: `validate.fish`

- [ ] **Step 1: Locate Phase 1f registry**

Run:
```fish
grep -n "^# Phase 1f\|planning.md.*labels\|rules anchor labels" validate.fish | head -10
```
Find the registry that lists required labels in `planning.md`.

- [ ] **Step 2: Add `scope-tier-memory-check` label**

Edit `validate.fish` Phase 1f. Append `"scope-tier-memory-check"` (or `"Scope-tier memory check"`, depending on the existing list shape — match the format).

- [ ] **Step 3: Locate Phase 1g canonical-string registry**

Run:
```fish
grep -n "^# Phase 1g\|canonical_strings\|drift" validate.fish | head -10
```

- [ ] **Step 4: Add scope-tier canonical strings**

Phase 1g registers strings that must NOT appear restated outside their canonical home. Add:
- The verb list (canonical home: `hooks/scope-tier-memory-check.sh`)
- The minimizer list
- The scope-expander list
- The blast-radius paths
- The blast-radius words
- The scope-tier memory keywords
- The literal `SCOPE-TIER MATCH:` emission prefix

Use the existing Phase 1g pattern — typically a `set canonical_registry "string|canonical-file"` array. Each entry must be exact-match grep-able.

- [ ] **Step 5: Locate Phase 1j stable-anchor registry**

Run:
```fish
grep -n "^# Phase 1j\|stable.anchor\|trivial-tier-criteria" validate.fish | head -10
```

- [ ] **Step 6: Add `#scope-tier-memory-check` to registry**

Append the anchor to the Phase 1j list (single string addition).

- [ ] **Step 7: Run validate.fish full pass**

Run:
```fish
fish validate.fish 2>&1 | tail -40
```
Expected: all phases pass. If Phase 1g fails because a restated string exists somewhere we didn't expect (e.g., the spec document itself), audit:
```fish
grep -rn "prune.*rename.*delete.*trim" docs/ rules/
```
Spec documents are allowed to reference the lists by description but not restate them as canonical lists. If the spec restates, that's a Phase 1g hit — fix the spec to reference the hook as canonical.

- [ ] **Step 8: Commit**

```fish
git add validate.fish
git commit -m "feat(validate): Phase 1f/1g/1j registry updates for scope-tier-memory-check" \
  -m "Adds the new subsection label, canonical-string registrations for" \
  -m "all six hook lists + emission prefix, and stable anchor" \
  -m "#scope-tier-memory-check. Catches future restatement / removal." \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: `validate.fish` — Phase 1o (Hook + Substrate Artifacts)

Add the new phase that asserts hook script presence + executable + shellcheck + Eval `additional_context` field.

**Files:**
- Modify: `validate.fish`
- Create: `tests/validate-phase-1o.test.ts`

- [ ] **Step 1: Write the Phase 1o test fixture**

Create `tests/validate-phase-1o.test.ts`. Mirror the existing `tests/validate-phase-1l.test.ts` pattern. Cover:
- PASS case: hook present, executable, shellcheck-clean, installer present, Eval interface contains `additional_context`
- FAIL case (hook missing): rename hook temporarily, run phase, expect non-zero exit
- FAIL case (hook not executable): chmod -x temporarily
- FAIL case (substrate field missing): comment out `additional_context` from evals-lib.ts temporarily

```typescript
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, cpSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = join(import.meta.dir, "..");

function runPhase1o(repoDir: string): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("fish", [join(REPO, "validate.fish")], {
    env: { ...process.env, CLAUDE_CONFIG_REPO_DIR: repoDir, VALIDATE_PHASES: "1o" },
    encoding: "utf8"
  });
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function copyRepoFixture(): string {
  const tmp = mkdtempSync(join(tmpdir(), "validate-1o-"));
  // Minimum needed for Phase 1o: hooks/, bin/, tests/evals-lib.ts
  for (const p of [
    "hooks/scope-tier-memory-check.sh",
    "bin/install-scope-tier-hook.fish",
    "tests/evals-lib.ts",
    "validate.fish",
  ]) {
    cpSync(join(REPO, p), join(tmp, p), { recursive: false });
  }
  return tmp;
}

describe("validate.fish Phase 1o", () => {
  test("passes on clean repo with all artifacts present", () => {
    const result = runPhase1o(REPO);
    expect(result.code).toBe(0);
    expect(result.stdout + result.stderr).not.toContain("FAIL");
  });

  test("fails when hook script missing", () => {
    const fixture = copyRepoFixture();
    rmSync(join(fixture, "hooks/scope-tier-memory-check.sh"));
    const result = runPhase1o(fixture);
    expect(result.code).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/scope-tier-memory-check\.sh.*missing/i);
    rmSync(fixture, { recursive: true, force: true });
  });

  test("fails when hook script not executable", () => {
    const fixture = copyRepoFixture();
    chmodSync(join(fixture, "hooks/scope-tier-memory-check.sh"), 0o644);
    const result = runPhase1o(fixture);
    expect(result.code).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/not executable/i);
    rmSync(fixture, { recursive: true, force: true });
  });

  test("fails when Eval interface missing additional_context field", () => {
    const fixture = copyRepoFixture();
    const evalsLib = readFileSync(join(fixture, "tests/evals-lib.ts"), "utf8");
    const broken = evalsLib.replace(/additional_context\?:\s*string;/g, "// removed");
    writeFileSync(join(fixture, "tests/evals-lib.ts"), broken);
    const result = runPhase1o(fixture);
    expect(result.code).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/additional_context/i);
    rmSync(fixture, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:
```fish
bun test tests/validate-phase-1o.test.ts
```
Expected: all tests fail (Phase 1o doesn't exist in validate.fish yet).

- [ ] **Step 3: Add Phase 1o to validate.fish**

Edit `validate.fish`. After the existing Phase 1n block, add:

```fish
# ─────────────────────────────────────────────────────────────────────
# Phase 1o: Scope-tier hook + installer + substrate field presence
# ─────────────────────────────────────────────────────────────────────
echo
echo "── Phase 1o: scope-tier hook artifacts"

set -l hook_path "$repo_dir/hooks/scope-tier-memory-check.sh"
set -l installer_path "$repo_dir/bin/install-scope-tier-hook.fish"
set -l evals_lib_path "$repo_dir/tests/evals-lib.ts"

# Hook script presence
if not test -f $hook_path
    fail "hooks/scope-tier-memory-check.sh missing"
else
    pass "hooks/scope-tier-memory-check.sh present"
    # Executable bit
    if not test -x $hook_path
        fail "hooks/scope-tier-memory-check.sh not executable"
    else
        pass "hooks/scope-tier-memory-check.sh executable"
    end
    # Shellcheck clean
    if command -q shellcheck
        if shellcheck $hook_path >/dev/null 2>&1
            pass "hooks/scope-tier-memory-check.sh shellcheck clean"
        else
            fail "hooks/scope-tier-memory-check.sh shellcheck reported warnings"
        end
    end
end

# Installer presence + executable
if not test -f $installer_path
    fail "bin/install-scope-tier-hook.fish missing"
else
    pass "bin/install-scope-tier-hook.fish present"
    if not test -x $installer_path
        fail "bin/install-scope-tier-hook.fish not executable"
    else
        pass "bin/install-scope-tier-hook.fish executable"
    end
end

# Substrate Eval interface includes additional_context
if test -f $evals_lib_path
    if grep -qE 'additional_context\?:\s*string' $evals_lib_path
        pass "tests/evals-lib.ts Eval.additional_context present"
    else
        fail "tests/evals-lib.ts Eval interface missing additional_context field (substrate contract for scope-tier evals)"
    end
else
    fail "tests/evals-lib.ts missing — substrate contract cannot be verified"
end
```

If `validate.fish` supports the `VALIDATE_PHASES` env var to scope which phases run, ensure Phase 1o is gated by it. If not, the Phase 1o test fixtures will need to run the full pass.

- [ ] **Step 4: Run test to verify pass**

Run:
```fish
bun test tests/validate-phase-1o.test.ts
fish validate.fish 2>&1 | tail -10
```
Expected: Bun test all pass; validate.fish full pass.

- [ ] **Step 5: Commit**

```fish
git add validate.fish tests/validate-phase-1o.test.ts
git commit -m "feat(validate): Phase 1o — scope-tier hook + installer + substrate field" \
  -m "Asserts hook script + installer present + executable + shellcheck clean," \
  -m "and that tests/evals-lib.ts Eval interface contains the additional_context" \
  -m "field (substrate contract for scope-tier routing-contract evals)." \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Tests for Phase 1f/1g/1j Extensions

Extend the existing phase tests to cover the new entries.

**Files:**
- Modify: `tests/validate-phase-1g.test.ts`

- [ ] **Step 1: Add Phase 1g coverage for canonical-string registrations**

Edit `tests/validate-phase-1g.test.ts`. Add tests asserting:
- The hook script is recognized as the canonical home for the verb / minimizer / scope-expander / blast-radius lists.
- Restating any of those lists in another file (e.g., `rules/planning.md`) triggers a Phase 1g failure.

Use the existing test fixtures pattern (copy the relevant slice of the repo, mutate, run validate, assert exit code).

- [ ] **Step 2: Run tests**

Run:
```fish
bun test tests/validate-phase-1g.test.ts
```
Expected: pass.

- [ ] **Step 3: Confirm Phase 1j stable-anchor test already covers the new anchor**

The existing `tests/validate-phase-1j.test.ts` typically iterates over a registry — if our Phase 1j addition (`#scope-tier-memory-check`) lands in that registry, it's auto-covered. Verify:
```fish
grep -n "scope-tier-memory-check" tests/validate-phase-1j.test.ts 2>/dev/null
```
If the registry is structural (a literal list in the test file), add the new anchor to that list. Otherwise the test parses validate.fish's own registry — auto-covered.

- [ ] **Step 4: Commit**

```fish
git add tests/validate-phase-1g.test.ts tests/validate-phase-1j.test.ts
git commit -m "test(validate): extend Phase 1g/1j tests for scope-tier registrations" \
  -m "Asserts scope-tier hook is the canonical home for the 6 keyword lists" \
  -m "and that #scope-tier-memory-check anchor is registered in Phase 1j." \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Eval Suite — 10 Evals + Fixtures

Create the eval suite + 10 fixture subdirectories per spec section 4b/5.

**Files:**
- Create: `rules-evals/scope-tier-memory-check/evals.json`
- Create: `tests/fixtures/scope-tier-memory-check/README.md`
- Create: `tests/fixtures/scope-tier-memory-check/<eval-name>/...` (10 subdirs)

- [ ] **Step 1: Create fixtures README**

Create `tests/fixtures/scope-tier-memory-check/README.md`:

```markdown
# Scope-Tier Memory Check Fixtures

Fixtures for evals in `rules-evals/scope-tier-memory-check/evals.json`.

Two fixture classes:

## End-to-End (uses `setup`)

These evals install the real hook into the scratch cwd's
`.claude/settings.local.json` and exercise the bash hook → claude
→ assertion path. Each fixture's `setup.sh` is written into the
eval's `setup:` field at load time.

Subdirectories:
- `pr-330-canonical/` — PR #330 prompt shape with scope-tier memory loaded
- `pressure-framing-minimizer/` — minimizer present, no match expected
- `large-scope-keyword/` — scope-expander present, no match expected
- `no-matching-memory/` — clean prompt, no scope-tier memory loaded
- `sentinel-bypass-active/` — sentinel present, hook bypasses
- `blast-radius-public-api/` — exported API symbol, no match expected
- `git-working-tree-large/` — 8 in-flight files, no match expected

## Routing Contract (uses `additional_context`)

These evals SKIP the bash hook and inject a synthetic `<system-reminder>`
into the prompt envelope via the substrate's `additional_context`
field. Tests the model's response to the reminder in isolation.

Subdirectories:
- `routing-contract-positive/` — reminder injected, model should ack + route
- `hook-not-installed/` — no reminder + no hook; documents graceful degradation
- `routing-contract-conflict-challenge/` — reminder + obviously-large prompt; model should challenge

## Orphaned fixtures

None.
```

- [ ] **Step 2: Create fixture subdirectories**

For each of the 10 fixtures, create the subdirectory with `prompt.md` + (for end-to-end) `setup.sh` + (for memory-loaded) `memory/MEMORY.md`. Use the worked example for `pr-330-canonical`:

```fish
mkdir -p tests/fixtures/scope-tier-memory-check/pr-330-canonical/memory
cat > tests/fixtures/scope-tier-memory-check/pr-330-canonical/prompt.md <<'EOF'
prune the per-gate floor blocks in rules/planning.md — the substitutable ones per ADR #0007
EOF
cat > tests/fixtures/scope-tier-memory-check/pr-330-canonical/memory/MEMORY.md <<'EOF'
# Memory Index

- [feedback_right_size_ceremony](feedback_right_size_ceremony.md) — Right-size pipeline ceremony to feature size: small/mechanical changes should skip DTP/SA/brainstorm/FMS
EOF
cat > tests/fixtures/scope-tier-memory-check/pr-330-canonical/setup.sh <<'EOF'
#!/bin/bash
set -e
mkdir -p .claude
cat > .claude/settings.local.json <<JSON
{
  "hooks": {
    "UserPromptSubmit": [
      {"hooks": [{"type": "command", "command": "$HOOK_ABS_PATH"}]}
    ]
  }
}
JSON
# Memory dir mirroring the production path
mkdir -p .claude/projects/-Users-cantu-repos-claude-config/memory
cp memory/MEMORY.md .claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md
cp memory/MEMORY.md .claude/projects/-Users-cantu-repos-claude-config/memory/feedback_right_size_ceremony.md
EOF
chmod +x tests/fixtures/scope-tier-memory-check/pr-330-canonical/setup.sh
```

Repeat the pattern for each of the remaining 9 fixtures, varying the prompt + memory + setup contents per spec section 4b. For the `git-working-tree-large` fixture, `setup.sh` runs `git init` and seeds 8 files via `git add -N`. For `sentinel-bypass-active`, `setup.sh` creates `.claude/DISABLE_PRESSURE_FLOOR`.

- [ ] **Step 3: Create the evals.json**

Create `rules-evals/scope-tier-memory-check/evals.json`:

```json
{
  "skill": "scope-tier-memory-check",
  "description": "Pipeline-entry hook + Layer 2 routing-contract evals for the scope-tier memory check (closes #332 / PR #330 class).",
  "evals": [
    {
      "name": "pr-330-canonical",
      "prompt": "prune the per-gate floor blocks in rules/planning.md — the substitutable ones per ADR #0007",
      "setup": "bash tests/fixtures/scope-tier-memory-check/pr-330-canonical/setup.sh",
      "assertions": [
        {"type": "contains", "value": "[Scope-tier match: feedback_right_size_ceremony]"},
        {"type": "not_tool_use", "tool": "Skill", "matches": {"skill": "define-the-problem"}}
      ]
    },
    {
      "name": "pressure-framing-minimizer",
      "prompt": "just a quick fix to planning.md, small change",
      "setup": "bash tests/fixtures/scope-tier-memory-check/pressure-framing-minimizer/setup.sh",
      "assertions": [
        {"type": "not_contains", "value": "[Scope-tier match:"},
        {"type": "tool_use", "tool": "Skill", "matches": {"skill": "define-the-problem"}}
      ]
    },
    {
      "name": "large-scope-keyword",
      "prompt": "rearchitect the rules system, refactor across the front-door layer",
      "setup": "bash tests/fixtures/scope-tier-memory-check/large-scope-keyword/setup.sh",
      "assertions": [
        {"type": "not_contains", "value": "[Scope-tier match:"}
      ]
    },
    {
      "name": "no-matching-memory",
      "prompt": "prune the dead code in lib/foo.ts",
      "setup": "bash tests/fixtures/scope-tier-memory-check/no-matching-memory/setup.sh",
      "assertions": [
        {"type": "not_contains", "value": "[Scope-tier match:"}
      ]
    },
    {
      "name": "sentinel-bypass-active",
      "prompt": "prune the per-gate floor blocks in rules/planning.md",
      "setup": "bash tests/fixtures/scope-tier-memory-check/sentinel-bypass-active/setup.sh",
      "assertions": [
        {"type": "not_contains", "value": "[Scope-tier match:"}
      ]
    },
    {
      "name": "blast-radius-public-api",
      "prompt": "rename the exported `serializePayload` symbol in `api/v1/checkout.ts`",
      "setup": "bash tests/fixtures/scope-tier-memory-check/blast-radius-public-api/setup.sh",
      "assertions": [
        {"type": "not_contains", "value": "[Scope-tier match:"}
      ]
    },
    {
      "name": "git-working-tree-large",
      "prompt": "rename `helperA` to `helperB` in `src/utils/foo.ts`",
      "setup": "bash tests/fixtures/scope-tier-memory-check/git-working-tree-large/setup.sh",
      "assertions": [
        {"type": "not_contains", "value": "[Scope-tier match:"}
      ]
    },
    {
      "name": "routing-contract-positive",
      "prompt": "prune the dead code from `lib/foo.ts`",
      "additional_context": "SCOPE-TIER MATCH: feedback_right_size_ceremony. Per stored feedback, this prompt qualifies as small/mechanical/known-approach. Route to direct implementation: skip DTP, Systems Analysis, brainstorming, Fat Marker Sketch, and subagent-driven-development.",
      "assertions": [
        {"type": "contains", "value": "[Scope-tier match: feedback_right_size_ceremony]"},
        {"type": "not_tool_use", "tool": "Skill", "matches": {"skill": "define-the-problem"}}
      ]
    },
    {
      "name": "hook-not-installed",
      "prompt": "prune the per-gate floor blocks in rules/planning.md",
      "assertions": [
        {"type": "not_contains", "value": "[Scope-tier match:"}
      ]
    },
    {
      "name": "routing-contract-conflict-challenge",
      "prompt": "rename `Foo` to `Bar` across the public SDK — this will break all downstream consumers",
      "additional_context": "SCOPE-TIER MATCH: feedback_right_size_ceremony. Per stored feedback, this prompt qualifies as small/mechanical/known-approach.",
      "assertions": [
        {"type": "contains_any", "values": ["incorrectly", "wrong signal", "confirm direct implementation"]},
        {"type": "not_contains", "value": "[Scope-tier match: feedback_right_size_ceremony] Routing"}
      ]
    }
  ]
}
```

Adjust the assertion type names to match the actual types your eval substrate supports (look at an existing rules-evals/<skill>/evals.json for the exact assertion vocabulary).

- [ ] **Step 4: Validate eval file shape**

Run:
```fish
fish validate.fish 2>&1 | grep -E "1m|1n" | tail -10
```
Expected: Phase 1m + 1n pass for the new eval file + fixture dir.

- [ ] **Step 5: Run a single eval against the live model (smoke test)**

Run:
```fish
bun tests/eval-runner-v2.ts rules-evals/scope-tier-memory-check/evals.json --filter pr-330-canonical
```
Expected: eval passes (or fails with a meaningful assertion diff that points to either a hook bug or an assertion-spec bug — fix and re-run).

- [ ] **Step 6: Run the full suite**

Run:
```fish
bun tests/eval-runner-v2.ts rules-evals/scope-tier-memory-check/evals.json
```
Expected: all 10 evals pass. If `routing-contract-conflict-challenge` is flaky (depends on model variance), tag it as `tier: "diagnostic"` rather than `tier: "required"` so it informs without blocking.

- [ ] **Step 7: Commit**

```fish
git add rules-evals/scope-tier-memory-check/ tests/fixtures/scope-tier-memory-check/
git commit -m "test(evals): scope-tier 10-eval suite + 10 fixture subdirs" \
  -m "Seven end-to-end evals exercise the real bash hook installed into" \
  -m "scratch cwd; three routing-contract evals inject synthetic" \
  -m "<system-reminder> via additional_context. pr-330-canonical is the" \
  -m "canonical regression test for the PR #330 failure class." \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: README Update + Validate.fish Re-Run

Update README + run full validation.

**Files:**
- Modify: `rules/README.md`

- [ ] **Step 1: Update Phase table in `rules/README.md`**

Find the validate.fish phase description block and append a Phase 1o row:

```markdown
- **1o. Scope-tier hook + installer + substrate field** — fails if
  `hooks/scope-tier-memory-check.sh` is missing or not executable;
  if `bin/install-scope-tier-hook.fish` is missing or not executable;
  if shellcheck reports warnings on the hook; or if the `Eval`
  interface in `tests/evals-lib.ts` does not declare the
  `additional_context?: string` field (substrate contract for the
  scope-tier routing-contract evals). Regression coverage:
  `tests/validate-phase-1o.test.ts`.
```

Add a sentence to the 1g description mentioning the new canonical-string lists are also registered.

- [ ] **Step 2: Run full validate.fish**

Run:
```fish
fish validate.fish
```
Expected: every phase reports PASS, zero FAILs.

- [ ] **Step 3: Run full test suite**

Run:
```fish
bun test tests/
```
Expected: all bun tests pass (substrate, Phase 1g, Phase 1j, Phase 1o).

```fish
bash tests/hooks/scope-tier-memory-check.test.sh
bash tests/hooks/scope-tier-memory-check-log-rotation.test.sh
```
Expected: both shell test suites pass.

- [ ] **Step 4: Commit**

```fish
git add rules/README.md
git commit -m "docs(rules): add Phase 1o row + Phase 1g scope-tier registrations" \
  -m "" \
  -m "Refs #332" \
  -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Local Hook Install + Fresh-Session Verification

Install the hook in the user's settings, then open a fresh Claude Code session to validate end-to-end behavior.

**Files:** None (manual verification)

- [ ] **Step 1: Install the hook**

Run:
```fish
fish bin/install-scope-tier-hook.fish
fish bin/install-scope-tier-hook.fish --check
```
Expected: `Hook installed` then `Hook registered`.

- [ ] **Step 2: Verify the hook in a fresh Claude Code session**

Open a new terminal and start a fresh Claude Code session:
```fish
claude
```

Issue this prompt verbatim (PR #330 shape):
> prune the per-gate floor blocks in rules/planning.md — the substitutable ones

**Expected observation:**
- A `<system-reminder>` containing `SCOPE-TIER MATCH: feedback_right_size_ceremony` appears in the session
- The agent emits `[Scope-tier match: feedback_right_size_ceremony] Routing to direct implementation per stored feedback.`
- The agent does NOT invoke `Skill(define-the-problem)`
- The agent proceeds to mechanical implementation

If any expectation misses, investigate via:
```fish
tail -20 ~/.claude/logs/scope-tier-hook.log
```
This shows the per-criterion decision for the prompt.

- [ ] **Step 3: Verify the blast-radius rejection**

Same session, issue:
> rename the exported `serializePayload` in `api/v1/checkout.ts`

**Expected:** no `SCOPE-TIER MATCH:` reminder; pipeline routing proceeds normally (DTP/SA path).

- [ ] **Step 4: Verify the sentinel-bypass behavior**

```fish
touch ~/.claude/DISABLE_PRESSURE_FLOOR
```

In a fresh session, issue the PR #330 prompt again. **Expected:** no reminder; current pre-scope-tier behavior preserved.

```fish
rm ~/.claude/DISABLE_PRESSURE_FLOOR
```

- [ ] **Step 5: Record the verification in a PR comment**

Note in the eventual PR description that all four verification steps passed (or document any deviations).

---

## Task 16: Cold-Start Sanity Check (Rollout Step 11)

Replay the hook against any available prior session logs to capture a first FP/FN signal at merge time.

**Files:** None (one-time measurement)

- [ ] **Step 1: Locate prior session log files**

Run:
```fish
ls -lt ~/.claude/projects/-Users-cantu-repos-claude-config/sessions/*.jsonl 2>/dev/null | head -30
```

If no session logs exist, skip this task and record "no prior logs available for cold-start" in the PR description.

- [ ] **Step 2: Extract user prompts from up to 30 prior sessions**

```fish
# Each session log is JSONL; user prompts are entries with type=user
mkdir -p /tmp/scope-tier-cold-start
for f in (ls -t ~/.claude/projects/-Users-cantu-repos-claude-config/sessions/*.jsonl 2>/dev/null | head -30)
    jq -r 'select(.type=="user") | .message.content' "$f" 2>/dev/null \
      | head -1 \
      | jq -R 'select(length > 0) | {prompt: .}' 2>/dev/null
end > /tmp/scope-tier-cold-start/prompts.jsonl
wc -l /tmp/scope-tier-cold-start/prompts.jsonl
```

- [ ] **Step 3: Replay each prompt through the hook**

```fish
while read -l line
    echo $line | bash hooks/scope-tier-memory-check.sh > /tmp/scope-tier-cold-start/result.json 2>&1
    if test -s /tmp/scope-tier-cold-start/result.json
        echo "MATCH: $line"
    else
        echo "no_match"
    end
end < /tmp/scope-tier-cold-start/prompts.jsonl | tee /tmp/scope-tier-cold-start/replay.log
```

- [ ] **Step 4: Manual triage of matches**

Open `/tmp/scope-tier-cold-start/replay.log`. For each `MATCH:` entry, decide manually: was this prompt truly scope-tier (precision OK) or was it a false positive? Tally counts.

- [ ] **Step 5: Record results in `/tmp/scope-tier-cold-start/cold-start-report.md`**

Write a short report:
```
# Scope-Tier Hook Cold-Start Report

Date: <today>
Source: <N> prompts from <M> prior sessions

## Counts
- Total replay prompts: <N>
- Matches (hook would have fired): <count>
- True positives: <count> (truly scope-tier)
- False positives: <count> (truly needs pipeline)
- True negatives: <count>
- False negatives: <count> (scope-tier work the hook missed)

## Precision: <tp / (tp + fp)>
## Recall: <tp / (tp + fn)>

## Notable misses (FN)
<list>

## Notable false positives
<list>
```

- [ ] **Step 6: Include report in the eventual PR description**

When the PR opens, paste the cold-start report into the PR body so reviewers see the empirical signal alongside the design rationale.

---

## Task 17: Open Pull Request

Open the PR with full context.

**Files:** None (PR creation)

- [ ] **Step 1: Push the branch**

```fish
git push -u origin feature/scope-tier-memory-check
```

- [ ] **Step 2: Verify CI is green**

Wait for any GitHub Actions to complete. Run:
```fish
gh run list --branch feature/scope-tier-memory-check --limit 1
```
Expected: latest run status = `completed` with conclusion `success`.

- [ ] **Step 3: Create the PR**

Write PR body to `/tmp/pr-body.md`:
```fish
echo '## Summary

Closes #332. Adds a two-layer scope-tier memory check that fires at
pipeline entry on PR #330-class small/mechanical prompts and routes
them to direct implementation, skipping the planning pipeline.

- **Layer 1**: `hooks/scope-tier-memory-check.sh` — mechanical
  UserPromptSubmit hook (bash + jq) with 6 conjunctive criteria
  (verb, target, no-minimizer, no-scope-expander, no-blast-radius,
  small-git-diff). Emits `<system-reminder>` on match.
- **Layer 2**: new `<a id="scope-tier-memory-check"></a>` subsection
  in `rules/planning.md` step 1 — governs the model'"'"'s response
  to the reminder.
- **Substrate**: `additional_context?: string` field added to the
  `Eval` shape (`tests/evals-lib.ts`) so routing-contract evals can
  inject synthetic reminders.
- **Coverage**: 10 evals (7 end-to-end via real hook install; 3
  routing-contract via substrate field).
- **Validation**: new `Phase 1o` in `validate.fish` (hook + installer
  + substrate field presence).
- **Phase 2 follow-up**: issue #NNN already filed for 30-day corpus
  eval (precision >= 0.90, recall >= 0.70 thresholds).

## Test plan

- [x] `bun test tests/` — all unit tests pass (substrate + Phase 1g/1j/1o)
- [x] `bash tests/hooks/scope-tier-memory-check.test.sh` — 16 hook unit tests pass
- [x] `bash tests/hooks/scope-tier-memory-check-log-rotation.test.sh` — rotation triggers above 10 MB
- [x] `fish validate.fish` — all phases pass (1f, 1g, 1j, 1o registries updated)
- [x] `bun tests/eval-runner-v2.ts rules-evals/scope-tier-memory-check/evals.json` — 10 evals pass against live model
- [x] Manual: PR #330-shape prompt in fresh session triggers reminder + ack + direct routing
- [x] Manual: blast-radius prompt (`rename exported X in api/...`) does NOT trigger reminder
- [x] Manual: sentinel bypass (`touch ~/.claude/DISABLE_PRESSURE_FLOOR`) suppresses reminder
- [x] Cold-start sanity check: replayed N prompts from prior sessions, see report below

## Cold-Start Report

<paste report from Task 16 here>

## Confidence (architect-level)

- D1 (PR #330 class coverage): ~70%
- D2 (FP rate tolerance): ~65%
- D3 (Implementation feasibility): ~85%
- D4 (Maintainability past V1): ~55%
- Phase 2 corpus measurement will refine these.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
' > /tmp/pr-body.md

gh pr create \
  --title "feat(rules): scope-tier memory check (closes #332)" \
  --body-file /tmp/pr-body.md \
  --base main \
  --head feature/scope-tier-memory-check
```

- [ ] **Step 4: Confirm PR URL + open in browser**

The `gh pr create` output shows the URL. Open it and verify the description renders correctly.

---

## Self-Review

After the plan is complete and saved, walk through it once with fresh eyes.

**Spec coverage check:**

| Spec section | Task that implements it |
|---|---|
| §1 New subsection in `planning.md` | Task 9 |
| §2 `rules-evals/scope-tier-memory-check/evals.json` | Task 13 |
| §3 `tests/fixtures/scope-tier-memory-check/` | Task 13 |
| §4a Substrate adaptation (`additional_context`) | Task 2 |
| §4b 10 evals | Task 13 |
| §5 Fixtures + README | Task 13 |
| §6 Hook unit tests (per-criterion) | Tasks 3-7 |
| §7 validate.fish Phase 1f/1g/1j/1o updates | Tasks 10, 11 |
| §8 Phase test coverage | Tasks 11, 12 |
| §9 README update | Task 14 |
| Data flow | Tasks 3-7 (hook), 9 (rule) |
| Error handling | Tasks 3 (sentinel + stdin), 4 (memory), 5 (criteria), 6 (git) |
| Rollout steps 1-12 | Tasks 1, 2, 3-7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 |
| Measurement Plan Phase 1 | Tasks 7 (log) + 16 (cold-start) |
| Measurement Plan Phase 2 follow-up issue | Task 1 (filed BEFORE implementation) |
| Hook script (bash + jq) | Tasks 3-7 |
| Installer | Task 8 |
| Manual verification | Task 15 |

**Placeholder scan:** Searched for "TBD", "TODO", "implement later", "add appropriate" — none found in plan body (one `<paste report ...>` placeholder in Task 17 is intentional, populated at execution time).

**Type / naming consistency:**
- `additional_context` (field name, snake_case) — used in Task 2, Task 13. ✓
- `SCOPE-TIER MATCH:` (literal emission prefix) — used in Tasks 5, 9, 11, 13. ✓
- `hooks/scope-tier-memory-check.sh` (path) — Tasks 3, 8, 11, 14, 15. ✓
- `bin/install-scope-tier-hook.fish` (path) — Tasks 8, 11, 14, 15. ✓
- `#scope-tier-memory-check` (anchor) — Tasks 9, 10. ✓
- `DISABLE_PRESSURE_FLOOR` (sentinel) — Tasks 3, 9, 15. ✓

**Known fragility:** Task 13 step 6 may need re-running if the live model is non-deterministic on `routing-contract-conflict-challenge`. Mitigation noted (downgrade to `tier: "diagnostic"`).

Plan ready.
