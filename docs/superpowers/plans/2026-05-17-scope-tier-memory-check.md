# Scope-Tier Memory Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-layer scope-tier memory check — mechanical `UserPromptSubmit` hook (Layer 1) emits `<system-reminder>` on PR #330-class prompts; rule subsection in `rules/planning.md` step 1 (Layer 2) governs the model's routing response.

**Architecture:** Bash + jq hook with six conjunctive criteria (verb, target, no-minimizer, no-scope-expander, no-blast-radius, small-git-diff). Routing-contract evals use new optional `additional_context` field on Eval shape.

**Tech Stack:** Bash 3+, `jq`, `fish`, TypeScript + Bun for tests, `shellcheck`.

**Source spec:** `docs/superpowers/specs/2026-05-17-scope-tier-memory-check-design.md`

---

## Pre-Flight

Worktree: `/Users/cantu/repos/claude-config/.claude/worktrees/scope-tier-memory-check/` on `feature/scope-tier-memory-check`. Verify: `which jq shellcheck bun` — install via brew if missing.

**Execution-mode announcement** (per `rules/execution-mode.md` HARD-GATE): before first implementer dispatch, emit:

> **[Execution mode: subagent-driven]** Plan: 17 tasks across 11+ files (hook, installer, substrate, rule, validate phases, eval suite, fixtures), integration coupling between substrate / hook / eval / validate. Per-task spec-compliance review pays for itself.

---

## File Structure

**New:**
- `hooks/scope-tier-memory-check.sh`, `tests/hooks/scope-tier-memory-check.test.sh`, `tests/hooks/scope-tier-memory-check-log-rotation.test.sh`
- `bin/install-scope-tier-hook.fish`
- `rules-evals/scope-tier-memory-check/evals.json`
- `tests/fixtures/scope-tier-memory-check/README.md` + 10 subdirs
- `tests/validate-phase-1o.test.ts`

**Modified:**
- `tests/evals-lib.ts`, `tests/eval-runner-v2.ts`, `tests/evals-lib.test.ts`
- `validate.fish`, `rules/planning.md`, `rules/README.md`
- `tests/validate-phase-1g.test.ts`, `tests/validate-phase-1j.test.ts`

**Filed BEFORE implementation:** GitHub issue — Phase 2 corpus eval follow-up.

---

## Common Conventions (apply to every task)

- TDD: failing test → minimal impl → green → commit. Don't skip the failing-test step.
- Commit message format: `<type>(<scope>): <subject>` + `Refs #332` trailer + `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- After every commit: `bun test tests/` + `bash tests/hooks/*.sh` + `fish validate.fish` — none should regress.
- Shellcheck the hook after every edit: `shellcheck hooks/scope-tier-memory-check.sh`.
- Fish shell — no bash heredocs. Multi-line via temp file: `echo "..." > /tmp/msg && git commit -F /tmp/msg`.

---

## Task 1: File Phase 2 Follow-Up Issue (BEFORE implementation)

Per architect recommendation — file now so it isn't forgotten post-merge.

- [ ] **Step 1:** Verify `gh auth status` shows logged into github.com.
- [ ] **Step 2:** Write issue body to `/tmp/phase2-issue.md` with sections: Problem, Acceptance (precision ≥0.90, recall ≥0.70, 50 stratified prompts from `~/.claude/logs/scope-tier-hook.log`), Context (spec path + source PR + log location), Out of Scope (Phase 3 tool-use forcing — only if Phase 2 fails).
- [ ] **Step 3:** `gh issue create --repo chriscantu/claude-config --title "scope-tier hook corpus eval — 30-day FP/FN measurement (Phase 2 of #332)" --label "priority: 2-medium" --label "tracking" --body-file /tmp/phase2-issue.md`
- [ ] **Step 4:** Record returned issue number — replace `#NNN` placeholders in this plan and PR body via `sed -i '' 's/#NNN/#<actual>/g' docs/superpowers/plans/2026-05-17-scope-tier-memory-check.md`. Commit: `docs(plan): record Phase 2 issue #<actual>`.

---

## Task 2: Substrate — Optional `additional_context` Field on Eval

Adds the substrate primitive that routing-contract evals depend on. Without this, scope-tier evals can only test end-to-end (real hook installed in scratch cwd).

**Files:** `tests/evals-lib.ts`, `tests/eval-runner-v2.ts`, `tests/evals-lib.test.ts`

- [ ] **Step 1: Failing tests.** Append three `bun:test` cases to `tests/evals-lib.test.ts`: (a) accepts string `additional_context` on single-turn, (b) rejects non-string with error message matching `/additional_context.*string/`, (c) absent field preserves current behavior. Use `mkdtempSync` + `writeFileSync` pattern to fabricate eval files. Run: `bun test tests/evals-lib.test.ts` — expect 3 failures.

- [ ] **Step 2: Add field to `Eval` interface and `ValidatedEval` discriminated union.** In `tests/evals-lib.ts` ~line 88-115 (Eval) and ~line 129-147 (ValidatedEval single-turn branch), add:

  ```typescript
  /** Optional synthetic <system-reminder> the runner prepends to prompt
   *  envelope. Mutually informative with `setup` (end-to-end) — this is
   *  the routing-contract path. Single-turn only. */
  additional_context?: string;
  ```

- [ ] **Step 3: Add validation in `loadEvalFile`** (~line 500-595, single-turn branch). Before the single-turn construct, validate type:

  ```typescript
  let validatedAdditionalContext: string | undefined;
  if (e.additional_context !== undefined) {
    if (typeof e.additional_context !== "string") {
      throw new Error(`${file}: eval '${e.name}' additional_context must be a string (got ${typeof e.additional_context})`);
    }
    validatedAdditionalContext = e.additional_context;
  }
  ```

  Pass `additional_context: validatedAdditionalContext` to the single-turn `validatedEvals.push({...})`.

- [ ] **Step 4: Update `tests/eval-runner-v2.ts`.** Find prompt-build site (`grep -n "spawnClaude\|prompt:\|stdin.write" tests/eval-runner-v2.ts`). Factor out a named export `buildPrompt(eval_)` if not already exposed. Logic:

  ```typescript
  export function buildPrompt(eval_: ValidatedEval): string {
    if (eval_.kind === "single" && eval_.additional_context) {
      return `<system-reminder>\n${eval_.additional_context}\n</system-reminder>\n\n${eval_.prompt}`;
    }
    return eval_.kind === "single" ? eval_.prompt : "";
  }
  ```

  Use `buildPrompt(eval_)` wherever the prompt is written to claude's stdin.

- [ ] **Step 5: Integration test.** Append to `tests/evals-lib.test.ts`:

  ```typescript
  test("buildPrompt prepends additional_context as system-reminder", async () => {
    const { buildPrompt } = await import("./eval-runner-v2.ts");
    const result = buildPrompt({ kind: "single", name: "t", prompt: "do thing",
      additional_context: "SCOPE-TIER MATCH: foo", assertions: [] } as any);
    expect(result).toContain("<system-reminder>");
    expect(result).toContain("SCOPE-TIER MATCH: foo");
    expect(result.indexOf("SCOPE-TIER MATCH:")).toBeLessThan(result.indexOf("do thing"));
  });
  ```

- [ ] **Step 6:** `bun test tests/` — all pass. Commit `feat(evals): add optional additional_context field to Eval shape`.

---

## Task 3: Hook Skeleton — Sentinel + Stdin + Discovery

**Files:** `hooks/scope-tier-memory-check.sh`, `tests/hooks/scope-tier-memory-check.test.sh`

- [ ] **Step 1: Test harness scaffold.** Create `tests/hooks/scope-tier-memory-check.test.sh` mirroring `hooks/test-block-dangerous-git.sh`. Function `run_case name stdin_input expected_stdout expected_exit setup_cmd cleanup_cmd` — `eval`s setup, pipes stdin to hook, compares exit code and stdout substring, prints PASS/FAIL, accumulates totals, exits non-zero if any fail. `chmod +x` the test file.

- [ ] **Step 2: Failing tests — sentinel + stdin validation + no-memory.** Add cases covering: project-local sentinel suppresses, global sentinel suppresses, empty stdin → exit 0, non-JSON stdin → exit 0, missing `prompt` field → exit 0, no MEMORY.md → exit 0. Run — fails because hook doesn't exist.

- [ ] **Step 3: Create hook with skeleton.** `hooks/scope-tier-memory-check.sh`:

  ```bash
  #!/bin/bash
  # scope-tier-memory-check.sh — UserPromptSubmit hook
  # Disable: ~/.claude/DISABLE_PRESSURE_FLOOR or .claude/DISABLE_PRESSURE_FLOOR
  # Spec: docs/superpowers/specs/2026-05-17-scope-tier-memory-check-design.md
  set -u

  if [[ -f "${HOME}/.claude/DISABLE_PRESSURE_FLOOR" ]] \
    || [[ -f ".claude/DISABLE_PRESSURE_FLOOR" ]]; then exit 0; fi

  INPUT=$(cat 2>/dev/null || true)
  [[ -z "$INPUT" ]] && exit 0

  PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || true)
  [[ -z "$PROMPT" ]] && exit 0

  exit 0  # subsequent tasks add MEMORY.md scan + criteria
  ```

  `chmod +x`. Run tests — all pass.

- [ ] **Step 4:** `shellcheck hooks/scope-tier-memory-check.sh` clean. Commit `feat(hooks): scope-tier hook skeleton + sentinel bypass`.

---

## Task 4: Hook — MEMORY.md Discovery + Scope-Tier Keyword Scan

**Files:** `hooks/scope-tier-memory-check.sh`, `tests/hooks/scope-tier-memory-check.test.sh`

- [ ] **Step 1: Failing tests.** Add cases: (a) MEMORY.md exists WITH scope-tier entry → exit 0 still (criteria not yet implemented), but hook MUST read file without crashing (assert exit 0 + no stderr); (b) MEMORY.md exists WITHOUT scope-tier keyword → exit 0 (no-op). Use a fixture-setup helper that writes a MEMORY.md to `$TMPDIR/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md` and sets `CLAUDE_PROJECT_DIR`.

- [ ] **Step 2: Add canonical keyword list + discovery + scan.** Before the trailing `exit 0`:

  ```bash
  SCOPE_TIER_MEMORY_KEYWORDS=(
    "right-size" "small/mechanical" "skip DTP" "skip SA" "ceremony" "scope tier"
  )

  discover_memory_md() {
    local candidates=(
      "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md"
      "${HOME}/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md"
    )
    for c in "${candidates[@]}"; do
      [[ -r "$c" ]] && { echo "$c"; return 0; }
    done
    return 1
  }

  MEMORY_PATH=$(discover_memory_md) || exit 0

  MATCHED_MEMORIES=()
  while IFS= read -r line; do
    for kw in "${SCOPE_TIER_MEMORY_KEYWORDS[@]}"; do
      if [[ "$line" == *"$kw"* ]]; then
        memory_name=$(echo "$line" | sed -nE 's/.*\[([^]]+)\].*/\1/p')
        [[ -z "$memory_name" ]] && memory_name=$(echo "$line" | sed -nE 's/.*\(([^)]+)\.md\).*/\1/p')
        [[ -n "$memory_name" ]] && MATCHED_MEMORIES+=("$memory_name")
        break
      fi
    done
  done < "$MEMORY_PATH"

  [[ ${#MATCHED_MEMORIES[@]} -eq 0 ]] && exit 0
  ```

- [ ] **Step 3:** Tests pass + shellcheck clean. Commit `feat(hooks): MEMORY.md discovery + scope-tier keyword scan`.

---

## Task 5: Hook — Six Conjunctive Criteria + Emission

**Files:** `hooks/scope-tier-memory-check.sh`, `tests/hooks/scope-tier-memory-check.test.sh`

- [ ] **Step 1: Failing tests for each criterion.** Reuse `setup_memory_fixture` helper. Cases:
  - `all-criteria-pass-emits-match`: prompt = `"prune the dead block in rules/planning.md"` → stdout contains `SCOPE-TIER MATCH:`
  - `no-mechanical-verb-no-match`: prompt = `"think about the dead block in rules/planning.md"` → no emission
  - `minimizer-present-no-match`: prompt = `"just prune the dead block in rules/planning.md, small change"` → no emission
  - `scope-expander-present-no-match`: prompt = `"rearchitect the front-door across rules/planning.md"` → no emission
  - `blast-radius-public-api-no-match`: prompt = `"rename the exported serializePayload in api/v1/checkout.ts"` → no emission
  - `no-concrete-target-no-match`: prompt = `"prune things"` → no emission

- [ ] **Step 2: Add criteria lists + helpers + emission.** Replace trailing `exit 0` with:

  ```bash
  VERB_SIGNALS=("prune" "rename" "delete" "trim" "swap" "move" "typo" "comment-only" "format-only" "add row to" "update entry in" "remove from")
  MINIMIZERS=("just" "quick" "tiny" "trivial" "small change" "simple")
  SCOPE_EXPANDERS=("redesign" "restructure" "rearchitect" "refactor across" "migrate to" "rewrite" "introduce new" "cross-cutting change")
  BLAST_RADIUS_PATHS=("migrations/" "schema." ".sql" ".proto" "api/" "routes/" "controllers/" ".d.ts" "index.ts")
  BLAST_RADIUS_WORDS=("public API" "exported" "breaking change" "version bump" "release" "deploy")

  prompt_contains_any() {
    local arr_name="$1[@]" prompt_lower="${PROMPT,,}"
    for needle in "${!arr_name}"; do
      [[ "$prompt_lower" == *"${needle,,}"* ]] && return 0
    done
    return 1
  }

  prompt_has_concrete_target() {
    echo "$PROMPT" | grep -qE '[A-Za-z0-9_./-]+\.(md|ts|js|sh|fish|json|toml|yaml|yml|py|go|rs|java|kt|swift)\b' && return 0
    echo "$PROMPT" | grep -qE '`[^`]+`' && return 0
    echo "$PROMPT" | grep -qiE '\bline [0-9]+\b' && return 0
    return 1
  }

  HAS_VERB=false; HAS_TARGET=false; HAS_MINIMIZER=false
  HAS_SCOPE_EXPANDER=false; HAS_BLAST_PATH=false; HAS_BLAST_WORD=false
  prompt_contains_any VERB_SIGNALS && HAS_VERB=true
  prompt_has_concrete_target && HAS_TARGET=true
  prompt_contains_any MINIMIZERS && HAS_MINIMIZER=true
  prompt_contains_any SCOPE_EXPANDERS && HAS_SCOPE_EXPANDER=true
  prompt_contains_any BLAST_RADIUS_PATHS && HAS_BLAST_PATH=true
  prompt_contains_any BLAST_RADIUS_WORDS && HAS_BLAST_WORD=true

  if [[ "$HAS_VERB" != "true" ]] || [[ "$HAS_TARGET" != "true" ]] \
    || [[ "$HAS_MINIMIZER" == "true" ]] || [[ "$HAS_SCOPE_EXPANDER" == "true" ]] \
    || [[ "$HAS_BLAST_PATH" == "true" ]] || [[ "$HAS_BLAST_WORD" == "true" ]]; then
    exit 0
  fi

  # Task 6 inserts git pre-check here.

  memory_list=$(IFS=, ; echo "${MATCHED_MEMORIES[*]}")
  jq -n --arg mems "$memory_list" '{
    additionalContext: ("SCOPE-TIER MATCH: " + $mems +
      ". Per stored feedback, this prompt qualifies as small/mechanical/known-approach. " +
      "Route to direct implementation: skip DTP, Systems Analysis, brainstorming, " +
      "Fat Marker Sketch, and subagent-driven-development. execution-mode.md " +
      "single-implementer mode, goal-driven.md per-step verify checks, and " +
      "verification.md end-of-work gate STILL apply. If this match is wrong, " +
      "the user can re-prompt with explicit pipeline-invocation language.")
  }'
  ```

- [ ] **Step 3:** Tests pass (12 total now: 6 from earlier tasks + 6 new). Shellcheck clean. Commit `feat(hooks): six conjunctive criteria + emission`.

---

## Task 6: Hook — Git Working-Tree Pre-Check (Criterion 6)

**Files:** `hooks/scope-tier-memory-check.sh`, `tests/hooks/scope-tier-memory-check.test.sh`

- [ ] **Step 1: Failing tests.** Helper `setup_git_with_n_files dir n` does `git init -q`, sets test user, creates N files, `git add -N`. Cases:
  - `git-many-files-in-flight-no-match`: n=8 → no emission
  - `git-few-files-in-flight-still-matches`: n=3 → emission (prompt + memory valid)
  - `not-in-git-repo-still-matches`: no git init → emission
  - `git-migrations-path-in-flight-no-match`: variant helper creates `migrations/0001.sql` → no emission

- [ ] **Step 2: Implement criterion 6.** Insert at the `# Task 6 inserts...` marker:

  ```bash
  git_check_rejects() {
    command -v git >/dev/null 2>&1 || return 1
    timeout 2s git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
    local cached unstaged combined
    cached=$(timeout 2s git diff --cached --stat 2>/dev/null || true)
    unstaged=$(timeout 2s git diff --stat 2>/dev/null || true)
    combined=$(printf '%s\n%s' "$cached" "$unstaged")
    echo "$combined" | grep -qE '(^|/)(migrations|schema|db|api)/' && return 0
    local file_count loc_total
    file_count=$(echo "$combined" | grep -cE '\| +[0-9]+ ' || true)
    [[ "$file_count" -gt 5 ]] && return 0
    loc_total=$(echo "$combined" | grep -E '[0-9]+ insertion|[0-9]+ deletion' \
      | awk '{for(i=1;i<=NF;i++)if($i~/insertion|deletion/)sum+=$(i-1)} END{print sum+0}')
    [[ "$loc_total" -gt 200 ]] && return 0
    return 1
  }
  git_check_rejects && exit 0
  ```

- [ ] **Step 3:** All 16 tests pass. Shellcheck clean. Commit `feat(hooks): criterion 6 — git working-tree pre-check`.

---

## Task 7: Hook — Log Rotation

**Files:** `hooks/scope-tier-memory-check.sh`, `tests/hooks/scope-tier-memory-check-log-rotation.test.sh`

- [ ] **Step 1: Failing test.** Create `tests/hooks/scope-tier-memory-check-log-rotation.test.sh`: set `SCOPE_TIER_LOG_DIR=$TMP`, run hook once (creates log), fabricate 11 MB log via `dd if=/dev/zero of=$LOG_FILE bs=1M count=11`, run hook again. Assert `$LOG_FILE.1` exists AND `$LOG_FILE` size ≤ 5 MB. `chmod +x`. Run — fails (no logging).

- [ ] **Step 2: Add log + rotation.** After sentinel block in hook:

  ```bash
  LOG_DIR="${SCOPE_TIER_LOG_DIR:-${HOME}/.claude/logs}"
  LOG_FILE="$LOG_DIR/scope-tier-hook.log"
  LOG_ROTATED="$LOG_FILE.1"
  LOG_THRESHOLD=$((10*1024*1024))
  LOG_KEEP_TAIL=$((5*1024*1024))
  mkdir -p "$LOG_DIR" 2>/dev/null || true

  rotate_log_if_needed() {
    [[ ! -f "$LOG_FILE" ]] && return 0
    local size
    size=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
    if [[ "$size" -gt "$LOG_THRESHOLD" ]]; then
      tail -c "$LOG_KEEP_TAIL" "$LOG_FILE" > "$LOG_ROTATED" 2>/dev/null || true
      : > "$LOG_FILE"
    fi
  }

  log_decision() {
    local decision="$1"
    rotate_log_if_needed
    local ts prompt_hash matched_json
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    prompt_hash=$(printf '%s' "${PROMPT:-}" | shasum -a 256 2>/dev/null | awk '{print substr($1,1,16)}')
    matched_json=$(printf '%s\n' "${MATCHED_MEMORIES[@]:-}" | jq -R . | jq -s .)
    jq -n -c --arg ts "$ts" --arg decision "$decision" --arg ph "$prompt_hash" \
      --arg v "${HAS_VERB:-na}" --arg t "${HAS_TARGET:-na}" \
      --arg m "${HAS_MINIMIZER:-na}" --arg se "${HAS_SCOPE_EXPANDER:-na}" \
      --arg bp "${HAS_BLAST_PATH:-na}" --arg bw "${HAS_BLAST_WORD:-na}" \
      --argjson mm "$matched_json" \
      '{ts:$ts,decision:$decision,prompt_hash:$ph,criteria:{verb:$v,target:$t,minimizer:$m,scope_expander:$se,blast_path:$bp,blast_word:$bw},matched:$mm}' \
      >> "$LOG_FILE" 2>/dev/null || true
  }
  ```

  Add `log_decision "no_scope_tier_memory"` at the no-memory exit. Add `log_decision "no_match_git"` at the git rejection exit. Add `log_decision "match"` immediately before the jq emission. Add `log_decision "no_match"` at the conjunctive-fail exit.

- [ ] **Step 3:** Rotation test passes + main suite still passes + shellcheck clean. Commit `feat(hooks): per-criterion log + 10MB rotation`.

---

## Task 8: Installer — `bin/install-scope-tier-hook.fish`

**Files:** `bin/install-scope-tier-hook.fish`

- [ ] **Step 1: Write the installer.** Fish script with three modes: install (default), `--check`, `--remove`. Uses `jq` to idempotently add `{type: "command", command: "<abs hook path>"}` to `.hooks.UserPromptSubmit[]` in `~/.claude/settings.json`. `--check` exits 0 if registered, 1 if missing. `--remove` filters out the entry. `chmod +x`.

  Key jq pattern for install:
  ```fish
  jq --arg p "$hook_path" '
    .hooks //= {} | .hooks.UserPromptSubmit //= []
    | if (.hooks.UserPromptSubmit | any(.hooks // [] | any(.command == $p))) then .
      else .hooks.UserPromptSubmit += [{hooks: [{type: "command", command: $p}]}] end
  ' "$settings" > "$tmp"; and mv "$tmp" "$settings"
  ```

- [ ] **Step 2: Manual roundtrip test.**
  ```fish
  cp ~/.claude/settings.json /tmp/settings.snap
  fish bin/install-scope-tier-hook.fish
  fish bin/install-scope-tier-hook.fish --check    # exit 0
  fish bin/install-scope-tier-hook.fish            # idempotent — no dup
  jq '.hooks.UserPromptSubmit | length' ~/.claude/settings.json   # 1
  fish bin/install-scope-tier-hook.fish --remove
  fish bin/install-scope-tier-hook.fish --check    # exit 1
  cp /tmp/settings.snap ~/.claude/settings.json
  ```

- [ ] **Step 3:** Commit `feat(installer): idempotent scope-tier hook installer`.

---

## Task 9: `rules/planning.md` Subsection (Layer 2)

**Files:** `rules/planning.md`

- [ ] **Step 1: Locate insertion point.** `grep -n 'id="pressure-framing-floor"' rules/planning.md` — insert ABOVE this line in step 1 (DTP) block.

- [ ] **Step 2: Insert subsection.** Verbatim text from spec §1 Layer 2 "Subsection canonical text" block — anchor `<a id="scope-tier-memory-check"></a>` followed by acknowledgement+routing rules + hook absence note + sentinel-bypass inheritance + precedence vs Trivial-tier + precedence vs Expert Fast-Track.

- [ ] **Step 3:** `fish validate.fish` still passes (registry updates land next task). Commit `feat(rules): scope-tier-memory-check subsection in planning.md step 1`.

---

## Task 10: `validate.fish` — Phase 1f/1g/1j Registry Updates

**Files:** `validate.fish`

- [ ] **Step 1: Phase 1f.** Locate `planning.md` required-labels registry (`grep -n "planning.md.*labels" validate.fish`). Append entry for `Scope-tier memory check` (match existing format).

- [ ] **Step 2: Phase 1g.** Locate canonical-string registry. Add entries — each `"string|canonical-file"`:
  - verb list strings → `hooks/scope-tier-memory-check.sh`
  - minimizer list → hook
  - scope-expander list → hook
  - blast-radius paths → hook
  - blast-radius words → hook
  - scope-tier memory keywords → hook
  - `SCOPE-TIER MATCH:` literal emission prefix → hook

- [ ] **Step 3: Phase 1j.** Add `#scope-tier-memory-check` to stable-anchor registry.

- [ ] **Step 4:** `fish validate.fish` passes. If a Phase 1g hit appears in the spec doc — spec is allowed to reference lists by description; if it restates them, edit spec to reference hook as canonical. Commit `feat(validate): Phase 1f/1g/1j registry updates for scope-tier`.

---

## Task 11: `validate.fish` — Phase 1o + Test

**Files:** `validate.fish`, `tests/validate-phase-1o.test.ts`

- [ ] **Step 1: Failing test.** Create `tests/validate-phase-1o.test.ts` mirroring `tests/validate-phase-1l.test.ts`. Use `CLAUDE_CONFIG_REPO_DIR` to point at fixture dirs. Cases:
  - PASS on real repo
  - FAIL when `hooks/scope-tier-memory-check.sh` deleted
  - FAIL when hook not executable (`chmodSync 0o644`)
  - FAIL when Eval interface lacks `additional_context` (regex-replace it out)

  Run — fails (Phase 1o not in validate.fish yet).

- [ ] **Step 2: Add Phase 1o block to `validate.fish`** after Phase 1n:

  ```fish
  echo
  echo "── Phase 1o: scope-tier hook artifacts"

  set -l hook_path "$repo_dir/hooks/scope-tier-memory-check.sh"
  set -l installer_path "$repo_dir/bin/install-scope-tier-hook.fish"
  set -l evals_lib_path "$repo_dir/tests/evals-lib.ts"

  if not test -f $hook_path
      fail "hooks/scope-tier-memory-check.sh missing"
  else
      pass "hooks/scope-tier-memory-check.sh present"
      test -x $hook_path; and pass "executable"; or fail "not executable"
      if command -q shellcheck
          shellcheck $hook_path >/dev/null 2>&1
            and pass "shellcheck clean"
            or fail "shellcheck warnings"
      end
  end

  test -f $installer_path
      and pass "bin/install-scope-tier-hook.fish present"
      or fail "bin/install-scope-tier-hook.fish missing"
  test -x $installer_path; or fail "installer not executable"

  if test -f $evals_lib_path
      grep -qE 'additional_context\?:\s*string' $evals_lib_path
          and pass "Eval.additional_context present"
          or fail "Eval interface missing additional_context (substrate contract)"
  else
      fail "tests/evals-lib.ts missing"
  end
  ```

- [ ] **Step 3:** Test passes + `fish validate.fish` passes. Commit `feat(validate): Phase 1o — scope-tier hook + substrate field presence`.

---

## Task 12: Phase 1g/1j Test Extensions

**Files:** `tests/validate-phase-1g.test.ts`, `tests/validate-phase-1j.test.ts`

- [ ] **Step 1:** In `tests/validate-phase-1g.test.ts`, add: (a) test asserting the hook is the canonical home for the six keyword lists, (b) test asserting restatement of any list in `rules/planning.md` fails Phase 1g. Use existing fixture-copy-and-mutate pattern.

- [ ] **Step 2:** Check `tests/validate-phase-1j.test.ts` — if it iterates a literal registry list, add `#scope-tier-memory-check`; otherwise it auto-parses validate.fish's registry and needs no change.

- [ ] **Step 3:** `bun test tests/validate-phase-1g.test.ts tests/validate-phase-1j.test.ts` passes. Commit `test(validate): extend Phase 1g/1j coverage for scope-tier`.

---

## Task 13: Eval Suite — 10 Evals + 10 Fixtures

**Files:** `rules-evals/scope-tier-memory-check/evals.json`, `tests/fixtures/scope-tier-memory-check/README.md`, `tests/fixtures/scope-tier-memory-check/<eval>/`

- [ ] **Step 1: Fixtures README.** Document the two fixture classes (end-to-end uses `setup`; routing-contract uses `additional_context`). List all 10 subdirs. No orphans.

- [ ] **Step 2: Create 10 fixture subdirs.** Each contains `prompt.md` + (end-to-end only) `setup.sh` + (memory-loaded only) `memory/MEMORY.md`. Fixtures:

  | Name | Setup | Memory | Prompt key feature |
  |---|---|---|---|
  | `pr-330-canonical` | install hook | scope-tier loaded | PR #330 verbatim |
  | `pressure-framing-minimizer` | install hook | scope-tier loaded | `just`, `small change` |
  | `large-scope-keyword` | install hook | scope-tier loaded | `rearchitect` |
  | `no-matching-memory` | install hook | non-scope-tier | clean mechanical |
  | `sentinel-bypass-active` | install hook + touch sentinel | scope-tier loaded | clean mechanical |
  | `blast-radius-public-api` | install hook | scope-tier loaded | `exported` + `api/` |
  | `git-working-tree-large` | install hook + git init + 8 files via `git add -N` | scope-tier loaded | mechanical |
  | `routing-contract-positive` | none (uses `additional_context`) | n/a | clean mechanical |
  | `hook-not-installed` | no setup, no additional_context | n/a | PR #330 verbatim |
  | `routing-contract-conflict-challenge` | none (uses `additional_context`) | n/a | `rename Foo across public SDK — breaks all consumers` |

  End-to-end `setup.sh` template:
  ```bash
  #!/bin/bash
  set -e
  mkdir -p .claude .claude/projects/-Users-cantu-repos-claude-config/memory
  cat > .claude/settings.local.json <<JSON
  {"hooks": {"UserPromptSubmit": [{"hooks": [{"type": "command", "command": "$HOOK_ABS_PATH"}]}]}}
  JSON
  cp memory/MEMORY.md .claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md
  # Per-fixture additional setup (sentinel touch, git init, etc.)
  ```

  `$HOOK_ABS_PATH` resolved at eval-runner time from repo root. If the runner doesn't expand env vars in setup, hardcode the absolute path during fixture creation.

- [ ] **Step 3: Create `evals.json`.** Eight end-to-end + two routing-contract. Top-level `{skill, description, evals: [...]}`. Each eval has `name`, `prompt`, optional `setup`, optional `additional_context`, `assertions[]`. Assertion types — match what the runner supports (`grep -n '"type":' rules-evals/*/evals.json | head` to inventory). Likely candidates: `contains`, `not_contains`, `tool_use`, `not_tool_use`.

  Critical assertions per eval:
  - `pr-330-canonical`: contains `[Scope-tier match: feedback_right_size_ceremony]` + no `Skill(define-the-problem)` tool-use
  - All negative-match evals: not_contains `[Scope-tier match:`
  - `routing-contract-conflict-challenge`: contains_any `["incorrectly", "wrong signal", "confirm direct implementation"]` + not_contains `Routing to direct implementation` (challenge instead of route)

- [ ] **Step 4: Validate eval shape.** `fish validate.fish` — Phase 1m + 1n must pass for new file + fixture dir.

- [ ] **Step 5: Smoke test.** `bun tests/eval-runner-v2.ts rules-evals/scope-tier-memory-check/evals.json --filter pr-330-canonical`. Passes — or diff points to hook bug / assertion spec bug; fix and retry.

- [ ] **Step 6: Full eval run.** `bun tests/eval-runner-v2.ts rules-evals/scope-tier-memory-check/evals.json`. All 10 pass. If `routing-contract-conflict-challenge` is flaky against model variance, tag it `tier: "diagnostic"` per substrate convention.

- [ ] **Step 7:** Commit `test(evals): scope-tier 10-eval suite + 10 fixtures`.

---

## Task 14: README + Full Validate

**Files:** `rules/README.md`

- [ ] **Step 1:** Add Phase 1o row + extend Phase 1g description to mention scope-tier canonical-string registrations.
- [ ] **Step 2:** Full pass: `fish validate.fish` + `bun test tests/` + `bash tests/hooks/*.test.sh` — all pass.
- [ ] **Step 3:** Commit `docs(rules): add Phase 1o row + scope-tier registrations`.

---

## Task 15: Local Install + Fresh-Session Verification

Manual verification — no commit.

- [ ] **Step 1:** `fish bin/install-scope-tier-hook.fish && fish bin/install-scope-tier-hook.fish --check` — registered.
- [ ] **Step 2:** Fresh `claude` session, prompt: `"prune the per-gate floor blocks in rules/planning.md — the substitutable ones"`. Expected: `SCOPE-TIER MATCH: feedback_right_size_ceremony` reminder + ack line + no DTP invocation + direct routing.
- [ ] **Step 3:** Fresh session, prompt: `"rename the exported serializePayload in api/v1/checkout.ts"`. Expected: no reminder (blast-radius rejects).
- [ ] **Step 4:** `touch ~/.claude/DISABLE_PRESSURE_FLOOR`. Fresh session, PR #330 prompt. Expected: no reminder (bypass). Then `rm ~/.claude/DISABLE_PRESSURE_FLOOR`.
- [ ] **Step 5:** Record observations for PR description (include `tail -20 ~/.claude/logs/scope-tier-hook.log` snippet showing per-criterion decisions).

---

## Task 16: Cold-Start Sanity Check

One-time empirical signal at merge time — no commit.

- [ ] **Step 1:** `ls -lt ~/.claude/projects/-Users-cantu-repos-claude-config/sessions/*.jsonl 2>/dev/null | head -30`. If empty: skip; record "no prior logs" in PR.
- [ ] **Step 2:** Extract user prompts from up to 30 sessions:
  ```fish
  mkdir -p /tmp/scope-tier-cold-start
  for f in (ls -t ~/.claude/projects/-Users-cantu-repos-claude-config/sessions/*.jsonl | head -30)
    jq -r 'select(.type=="user") | .message.content' "$f" 2>/dev/null | head -1 \
      | jq -R 'select(length > 0) | {prompt: .}' 2>/dev/null
  end > /tmp/scope-tier-cold-start/prompts.jsonl
  ```

- [ ] **Step 3:** Replay each prompt through the hook; tally match vs no-match.
- [ ] **Step 4:** Manual triage of matches → precision; manual triage of no-matches that look scope-tier → recall.
- [ ] **Step 5:** Write `/tmp/scope-tier-cold-start/cold-start-report.md` with counts + precision + recall + notable FPs/FNs.

---

## Task 17: Open PR

- [ ] **Step 1:** `git push -u origin feature/scope-tier-memory-check`.
- [ ] **Step 2:** Wait for CI green: `gh run list --branch feature/scope-tier-memory-check --limit 1`.
- [ ] **Step 3:** Compose PR body via temp file (Summary + Test Plan checklist + Cold-Start Report from Task 16 + Confidence numbers). `gh pr create --title "feat(rules): scope-tier memory check (closes #332)" --body-file /tmp/pr-body.md --base main`.
- [ ] **Step 4:** Print PR URL for user.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| §1 Layer 2 subsection | 9 |
| §2 Layer 1 hook | 3, 4, 5, 6, 7 |
| §3 Installer | 8 |
| §4a Substrate `additional_context` | 2 |
| §4b 10 evals | 13 |
| §5 10 fixtures + README | 13 |
| §6 Hook tests | 3-7 |
| §7 validate.fish 1f/1g/1j/1o | 10, 11 |
| §8 Phase test extensions | 11, 12 |
| §9 README | 14 |
| Measurement Plan Phase 1 logging | 7 |
| Measurement Plan Phase 2 follow-up issue | 1 (BEFORE impl) |
| Manual verification | 15 |
| Cold-start sanity check | 16 |

**Placeholder scan:** Searched for "TBD"/"TODO"/"implement later" — none. One `<actual>` placeholder in Task 1 for issue number (populated by `sed` at run time per Task 1 step 4).

**Type / naming consistency** (cross-task):
- `additional_context` (snake_case TS field) — Tasks 2, 13. ✓
- `SCOPE-TIER MATCH:` (literal emission prefix) — Tasks 5, 9, 11, 13. ✓
- `hooks/scope-tier-memory-check.sh` — Tasks 3, 4, 5, 6, 7, 8, 11, 14, 15. ✓
- `bin/install-scope-tier-hook.fish` — Tasks 8, 11, 14, 15. ✓
- `#scope-tier-memory-check` anchor — Tasks 9, 10, 11. ✓
- `DISABLE_PRESSURE_FLOOR` sentinel — Tasks 3, 9, 15. ✓
- `MATCHED_MEMORIES` bash array — Tasks 4, 5, 7. ✓
- `SCOPE_TIER_LOG_DIR` test override env var — Task 7. ✓

**Known fragility:** Task 13 `routing-contract-conflict-challenge` may be flaky against model variance — downgrade to `tier: "diagnostic"` if so (per substrate convention). Other evals are deterministic.

Plan ready.
