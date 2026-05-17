# Design Spec: Scope-Tier Memory Check at Pipeline Entry

**Date**: 2026-05-17
**Status**: Proposed (revised twice after architectural review — see Review Outcomes)
**Related**:
- [Issue #332](https://github.com/chriscantu/claude-config/issues/332) — postmortem of PR #330 scope-tier memory miss
- [PR #330](https://github.com/chriscantu/claude-config/pull/330) — closed, superseded by [PR #331](https://github.com/chriscantu/claude-config/pull/331)
- `rules/planning.md` — front-door HARD-GATE; this spec extends step 1
- `rules/memory-discipline.md` — turn-local memory cite-and-ask gate (unchanged by this spec)
- `hooks/block-dangerous-git.sh` — reference pattern for sentinel-bypass + jq-based hook script
- Memory: `~/.claude/projects/-Users-cantu-repos-claude-config/memory/feedback_right_size_ceremony.md` — the canonical scope-tier feedback memory that PR #330 ignored
- Memory: `~/.claude/projects/-Users-cantu-repos-claude-config/memory/per_gate_floor_blocks_substitutable.md` — establishes that DTP step 1 is the canonical anchor for floor mechanics
- [ADR #0006](../../../adrs/0006-systems-analysis-pressure-framing-floor.md) — rejection precedent for per-gate floor duplication
- [ADR #0007](../../../adrs/0007-rules-pruning-substitutable-blocks.md) — establishes substitutability of per-gate blocks

## Architectural Review Outcomes

This spec was revised twice after adversarial review. First-pass review surfaced three defects (#1–#3); confidence-assessment second pass added three further tightenings (#A–#C).

### First-Pass Defects (addressed)

1. **Layer-mismatch fix (defect #1)** — original design was rule-text-only, structurally similar to the failure it was fixing. Revised design is two-layer: a mechanical `UserPromptSubmit` hook (Layer 1) injects a `<system-reminder>` when scope-tier conditions match; the rule text (Layer 2) governs how the model responds to that reminder. Hook removes the model-vigilance dependency for the *detection* step; rule text covers the *routing* step.
2. **Canonical-regression contradiction fix (defect #2)** — scope-expander list narrowed to verb-based phrases (`redesign`, `restructure`, `rearchitect`, `refactor across`, `migrate to`, `rewrite`, `introduce new`). Bare nouns (`pipeline`, `system`, `architecture`) dropped because they appear in PR #330-shape prompts that the gate is designed to catch.
3. **Measurement-infrastructure fix (defect #3)** — five canonical evals ship in Phase 1, plus a measurement plan with explicit FP/FN budget and a Phase 2 corpus-eval path that mines session logs after 30 days of hook telemetry.

### Second-Pass Tightenings (addressed)

These raised dimension-1 (PR #330 class coverage) confidence from ~60% → ~75% and dimension-2 (FP rate tolerance) from ~50% → ~70% per the architect-level confidence assessment:

A. **Substrate validation + adaptation (closes "eval substrate unvalidated" risk)** — confirmed `tests/evals-lib.ts` exposes `setup` + `teardown` + `scratch_decoy` per-eval primitives but lacks native `<system-reminder>` injection. Spec now ships two test paths: per-fixture hook install via `setup` writing `.claude/settings.local.json` (end-to-end, used for canonical regression evals); a new optional `additional_context: string` field on the Eval shape that the runner prepends as a `<system-reminder>` (lightweight, used for routing-contract evals that don't need the bash hook in the loop). The new field is a ~30-line substrate patch with full backward compatibility (optional; absent → current behavior).
B. **Blast-radius criterion added (closes biggest FP class)** — sixth conjunctive criterion: REJECT match if prompt mentions any of: explicit migration/schema/public-API paths (`migrations/`, `schema.*`, `*.sql`, `*.proto`, `api/`, `routes/`, `**/*.d.ts`, `index.ts` at package root), or any of these words/phrases: `public API`, `exported`, `breaking change`, `version bump`, `release`, `deploy`. PR #330's stored memory itself says "low blast radius" is a tier criterion; the original conjunctive design didn't measure it.
C. **Pre-commit git diff suppression (closes "in-flight large work" FP class)** — seventh conjunctive criterion: REJECT match if `git diff --cached --stat` OR `git diff --stat` reports > 5 files changed OR > 200 LOC OR any file path under `migrations/` / `schema/`. Catches cases where prompt shape looks mechanical but the working tree shows the user is mid-large-refactor. Graceful degradation: not-in-git-repo → no suppression (proceed); git command failure → no suppression (proceed); empty diff → no suppression.

Four defects from first-pass review (#4 description-field schema, #5 after-the-fact feedback loop, #7 verb-list maintenance burden, #10 coupling-map density) are explicitly accepted as V1 limitations and tracked in the "Known Limitations" section below as follow-up issues.

## Problem Statement

**User**: Claude when running the planning pipeline on small/mechanical change requests; secondarily, the human who reviews/lands the resulting PR.

**Problem**: `rules/memory-discipline.md` HARD-GATE fires on *recommendation-time* relevance — it assumes a stored memory is being weighed against an in-flight proposal. Scope-tier `feedback` memories (e.g., `feedback_right_size_ceremony.md`) apply *one step earlier*: at pipeline entry, governing whether the planning pipeline should run at all. The gate misses them because no recommendation is yet on the table.

**Impact**: PR #330 shipped +916 LOC of ceremony (DTP + Systems Analysis + brainstorm + Fat Marker Sketch + subagent-driven-development) for a small/mechanical/known-approach prune. The relevant memory loaded at both planning and execution sessions; ignored both times. Cost = PR #330 closed/superseded by PR #331 (slim version). Recurrence risk = every small change going forward; the failure mode is repeatable and silent.

**Evidence**: PR #330 (closed) vs PR #331 (replacement, ~1/10th the LOC) demonstrates the gap. The memory entry reads verbatim: *"Small/mechanical changes (~150 LOC, single-file, known approach) should skip DTP/SA/brainstorm/FMS + subagent-driven-dev; reserve for ambiguous or high-blast-radius work."* The work that triggered PR #330 met every criterion.

**Constraints**:
- Additive change to rules layer — no end-to-end rewrite of `memory-discipline.md`
- No memory entry rename
- No generic memory-relevance classifier (over-engineered; issue #332 body explicitly out-of-scope)
- Must compose with existing pressure-framing floor / emission contract / sentinel bypass anchors per ADR #0006 / #0007
- Must conform to validate.fish Phase 1f/1g/1j/1l/1m/1n contracts
- Hook script must follow existing `hooks/block-dangerous-git.sh` pattern (bash + jq, sentinel-bypass via `DISABLE_PRESSURE_FLOOR`, project-local file overrides global)

**Known Unknowns**:
- True false-positive/false-negative rates against the real prompt distribution. Five evals measure presence/absence on canonical cases; corpus eval is deferred to Phase 2 (see Measurement Plan).
- Whether description-field keyword scan stays sufficient as memory corpus grows (defect #4, deferred).
- Whether multi-memory match emission needs ordering rules (V1: emit one line per match, no ordering).

## Systems Analysis Summary

**Dependencies**: `rules/planning.md` (anchor host); `rules/memory-discipline.md` (unchanged but referenced); `rules/README.md` (Phase 1g registry table); `validate.fish` Phase 1f/1g/1j (anchor + canonical-string + delegate registries) plus new Phase 1o (hook script presence + executable bit); `rules-evals/scope-tier-memory-check/` (new eval suite); `tests/fixtures/scope-tier-memory-check/` (new fixtures + README per Phase 1n); `hooks/scope-tier-memory-check.sh` (new mechanical scanner); `~/.claude/settings.json` per-user UserPromptSubmit hook registration (documented in spec, not auto-installed); existing memory infrastructure (system-prompt MEMORY.md injection at session start, plus hook-side direct read of the file).

**Second-order effects**: Positive — closes the PR #330 failure class via mechanical detection; reuses the front-door anchor pattern for the routing step; provides a fast-path into the same destination as Trivial/Mechanical tier (convergent routing). Negative — risks: false positives route genuinely-needs-pipeline work to direct implementation (mitigated by conjunctive trigger requiring multiple positive signals AND minimizer absence AND scope-expander absence); precedence interactions with pressure-framing floor (mitigated by conjunctive precedence design); hook-script regressions (mitigated by `tests/hooks/` shell tests + Phase 1o presence check); per-user hook registration drift (mitigated by `bin/install-scope-tier-hook.fish` idempotent installer documented in rollout).

**Failure modes**: classifier false negative in the hook (memory match missed → PR #330 recurs; caught by Phase 2 corpus eval after 30 days); classifier false positive in the hook (large work routed to direct implementation → opposite-direction same-class failure; mitigated by conservative criteria + caught by Phase 2 corpus eval); precedence collision with pressure-framing floor (mitigated by conjunctive trigger design); sentinel-bypass inheritance ambiguity (mitigated by explicit declaration in both hook script and gate text); eval drift (mitigated by Phase 1m/1n contracts already in place); hook not registered in user's settings.json (mitigated by documented installer + verification step in rollout).

**Org impact**: Single-maintainer repo, fully reversible (rule additions revertible via git, hook script deletable, settings.json hook entry removable; no migration). Visible behavior change in fresh sessions with hook installed: small mechanical prompts produce a `<system-reminder>` from the hook, model routes to direct implementation. Without hook installed: behavior unchanged from current baseline (graceful degradation — Layer 2 rule text still applies as a soft check, but Layer 1 is the structural fix). Documentation surface: README Phase 1g + 1o registry updates; one ADR; one memory note; hook installation in repo README.

## Selected Approach

### Two-Layer Design

**Layer 1 — Mechanical Detection (UserPromptSubmit Hook)**

A bash script `hooks/scope-tier-memory-check.sh` runs as a `UserPromptSubmit` hook (per `~/.claude/settings.json` user-level registration). On every user prompt:

1. Read the prompt text from stdin (`jq -r '.prompt // empty'`).
2. Read `MEMORY.md` from `$CLAUDE_PROJECT_DIR/.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md` (or equivalent project memory path). Bail silently if not present.
3. Scan MEMORY.md description fields for scope-tier keywords (`right-size`, `small/mechanical`, `skip DTP`, `skip SA`, `ceremony`, `scope tier`).
4. If no scope-tier memory is present → exit 0 (no-op, no reminder).
5. If sentinel file `$CLAUDE_PROJECT_DIR/.claude/DISABLE_PRESSURE_FLOOR` OR `$HOME/.claude/DISABLE_PRESSURE_FLOOR` present → exit 0 (bypass).
6. Apply conjunctive criteria to the prompt (ALL must hold for a match):
   - **Verb signal (required positive)**: prompt contains one of: `prune`, `rename`, `delete`, `trim`, `swap`, `move`, `typo`, `comment-only`, `format-only`, `add row to`, `update entry in`, `remove from`
   - **Concrete-target signal (required positive)**: prompt matches one of: explicit file path (`*.md`, `*.ts`, etc.), single-quoted backtick symbol, single line reference (`line N`), or named registry entry
   - **Minimizer absence (required negative)**: prompt does NOT contain any of: `just`, `quick`, `tiny`, `trivial`, `small change`, `simple`
   - **Scope-expander absence (required negative)**: prompt does NOT contain any of: `redesign`, `restructure`, `rearchitect`, `refactor across`, `migrate to`, `rewrite`, `introduce new`, `cross-cutting change` *(narrowed to verb phrases — bare nouns like "pipeline" and "system" removed because they appear in legitimate scope-tier prompts)*
   - **Blast-radius absence (required negative, NEW)**: prompt does NOT mention any of these path patterns or words/phrases — path patterns: `migrations/`, `schema.`, `*.sql`, `*.proto`, `api/`, `routes/`, `controllers/`, `**/*.d.ts`, root `index.ts`; words/phrases: `public API`, `exported`, `breaking change`, `version bump`, `release`, `deploy`. Captures the "low blast radius" sub-criterion from the stored memory that the original conjunctive design missed.
   - **Git working-tree size absence (required negative, NEW)**: when invoked from inside a git repo, hook runs `git diff --cached --stat 2>/dev/null` and `git diff --stat 2>/dev/null`. REJECT match if combined output shows: > 5 files changed, OR > 200 LOC added/removed (sum of `+/-` columns), OR any file path under `migrations/` / `schema/` / `db/` / `api/` (path pattern overlap with criterion above — checking both pre-empts shell-quoting drift between the two heuristics). Outside git repos OR on git command failure → no suppression (graceful — never block prompts on environmental noise).
7. If all criteria match → emit a JSON object to stdout that Claude Code injects as a `<system-reminder>`:

   ```json
   {
     "additionalContext": "SCOPE-TIER MATCH: <memory-name(s)>. Per stored feedback, this prompt qualifies as small/mechanical/known-approach. Route to direct implementation: skip DTP, Systems Analysis, brainstorming, Fat Marker Sketch, and subagent-driven-development. execution-mode.md single-implementer mode, goal-driven.md per-step verify checks, and verification.md end-of-work gate STILL apply. If this match is wrong, the user can re-prompt with explicit pipeline-invocation language (e.g., 'this needs full planning')."
   }
   ```
8. If criteria do not match → exit 0 (no-op).

The hook is the *structural* gate: detection happens outside the model. The model receives a `<system-reminder>` and is asked to act on it — not to detect and act, but only to act.

**Layer 2 — Routing Behavior (rules/planning.md subsection)**

A new subsection in `rules/planning.md` step 1 (DTP) describes how the model responds to a `SCOPE-TIER MATCH:` system-reminder. This is the *response contract*. Stable anchor `<a id="scope-tier-memory-check"></a>` precedes the subsection heading.

Subsection canonical text:

```markdown
<a id="scope-tier-memory-check"></a>
**Scope-tier memory check.** A `UserPromptSubmit` hook
(`hooks/scope-tier-memory-check.sh`) inspects every prompt against loaded
scope-tier `feedback` memories. When the hook detects a match, it injects a
`<system-reminder>` beginning with the literal prefix `SCOPE-TIER MATCH:`.

When you receive a `SCOPE-TIER MATCH:` system-reminder:

1. Acknowledge the match in one visible line: `[Scope-tier match: <memory-name>] Routing to direct implementation per stored feedback.`
2. Route to direct implementation. Skip DTP, Systems Analysis,
   brainstorming, Fat Marker Sketch, and subagent-driven-development.
3. `execution-mode.md` single-implementer mode, `goal-driven.md` per-step
   verify checks, and `verification.md` end-of-work gate STILL apply.

If you believe the hook fired incorrectly (e.g., the prompt actually does
require the pipeline), name the specific signal that's wrong and ask the
user before proceeding: *"Hook fired SCOPE-TIER MATCH on X, but Y suggests
this needs pipeline. Confirm direct implementation or invoke pipeline?"*

When NO `SCOPE-TIER MATCH:` reminder is present, proceed to the
pressure-framing floor below (current behavior unchanged).

**Hook absence is graceful degradation.** If the hook is not installed (no
`UserPromptSubmit` entry in user settings), no reminder fires; the rest of
this section's gates evaluate normally. The Layer 2 rule text alone is a
soft check — the structural guarantee comes from Layer 1.

**Sentinel bypass inheritance.** The hook checks the
`DISABLE_PRESSURE_FLOOR` sentinel before evaluating criteria. When the
sentinel is present (project-local OR global), the hook exits 0 (no
reminder). Same off-switch as pressure-framing floor and Trivial-tier
four-criteria check — single flag for emergency rollback.

**Precedence vs Trivial/Mechanical tier.** Scope-tier hook match is a
fast-path into the same destination as Trivial tier (skip
DTP/SA/brainstorm/FMS, single-implementer mode). On match, jump straight
to direct implementation; Trivial-tier four-criteria check remains the
fallback for prompts WITHOUT a hook match but WITH all four criteria
satisfiable. Both routes converge.

**Precedence vs Expert Fast-Track.** Hook match wins; Fast-Track still
runs DTP (condensed), which scope-tier match skips entirely.
```

### Why This Design

**Why Layer 1 (hook) and not rule-text-only**: the PR #330 failure was the model loading a memory and not acting on it. Rule-text-only fix repeats that failure mode — the model must read the new rule, scan memory, evaluate criteria, all in-context. A hook moves the detection step outside the model into a deterministic bash script. The model only handles the routing step, which is what the rule text governs.

**Why a `<system-reminder>` and not a tool-use forcing function**: `<system-reminder>` is the highest-priority context channel Claude Code uses (memory resume context, hook output, MCP server instructions all use it). Tool-use forcing (e.g., requiring `acknowledge_named_cost_skip`) is even stronger but adds a user-facing tool call for routine prompts. Reminder is the right intensity for V1; tool-use forcing is the Phase 3 escalation path if Phase 2 corpus eval shows the reminder isn't sufficient.

**Why anchor A (planning.md step 1) over B (new file) or C (extend memory-discipline.md)**:
- **B** (new `rules/pipeline-entry-check.md`): rejected — orphan-rule risk; duplicates the front-door anchor pattern; adds symlink + validate.fish registry + README row for no architectural gain.
- **C** (extend `rules/memory-discipline.md`): rejected — contradicts the architectural invariant *"front-door enforcement lives in rules layer because it fires BEFORE any skill loads — a skill cannot catch its own failure-to-load"*. Memory-discipline currently fires turn-locally on recommendations; mixing pipeline-entry firing into the same rule splits its firing modes incoherently.

**Why narrowed scope-expander list**: original list included bare nouns (`pipeline`, `system`, `architecture`, `platform`). PR #330's own prompt likely contained "pipeline" because the rules ARE the planning pipeline. Bare-noun exclusion would have *prevented* the gate from catching the canonical regression case. Verb-phrase exclusion (`redesign`, `restructure`, `rearchitect`, `refactor across`, `migrate to`, `rewrite`, `introduce new`, `cross-cutting change`) clearly indicates large work without colliding with legitimate scope-tier prompts.

**Why conjunctive precedence and not "scope-tier wins outright"**: the pressure-framing floor exists because "just a small change" is often pressure framing, not a tier claim. Allowing scope-tier check to override pressure framing on bare minimizer wording reopens the exact failure mode the floor exists to close. Conjunctive trigger requires positive verb + concrete target + minimizer absence + scope-expander absence — by construction, a hook match is NOT a pressure-framed prompt.

## Architecture

Seven components, all additive (one new component vs original design — the hook script and its install path):

### 1. New hook script: `hooks/scope-tier-memory-check.sh`

Bash + jq, modeled on `hooks/block-dangerous-git.sh`. Reads prompt from stdin, scans MEMORY.md, applies conjunctive criteria, emits `additionalContext` JSON if match, else exits 0.

Key implementation notes:
- Sentinel bypass check FIRST (cheapest exit path)
- MEMORY.md path resolution via `$CLAUDE_PROJECT_DIR` env var with fallback to `pwd`-based discovery
- All keyword lists declared as bash arrays at the top of the script (single source of truth for canonical strings — Phase 1g validates restatement elsewhere). Six lists: scope-tier memory keywords, verb signals, minimizers, scope-expanders, blast-radius paths, blast-radius words.
- Git pre-check uses bounded timeouts: `timeout 2s git diff --cached --stat 2>/dev/null || true` — guarantees hook completes well under any reasonable `UserPromptSubmit` budget even on a pathologically slow repo.
- Exit 0 on any error reading MEMORY.md, running git, or computing criteria (graceful degradation — never block prompts due to scanner failure).
- Output JSON via `jq -n` to guarantee well-formed reminder.
- Script logs match decisions to `~/.claude/logs/scope-tier-hook.log` (newline-delimited JSON: timestamp, match-decision, criteria-evaluation result for each of the six criteria, git-pre-check counts, prompt-hash) — provides the telemetry stream for Phase 2 corpus eval, with per-criterion breakdown for diagnosing FP/FN cases.
- Log rotation: hook truncates the log file when it exceeds 10 MB (writes last 5 MB to `.log.1`, starts fresh). Bounded disk use; closes the "log grows unbounded" risk from confidence assessment.

### 2. New installer: `bin/install-scope-tier-hook.fish`

Idempotent fish script that adds the hook to `~/.claude/settings.json`. Pattern mirrors `bin/link-config.fish`. Uses jq to add the `UserPromptSubmit` entry without clobbering existing hooks. Includes `--check` mode for CI.

### 3. New subsection in `rules/planning.md` step 1 (DTP)

Inserted BEFORE the existing `<a id="pressure-framing-floor"></a>` block. Stable anchor `<a id="scope-tier-memory-check"></a>`. Canonical text per "Layer 2" section above.

### 4a. Substrate adaptation: `additional_context` field on Eval shape

`tests/evals-lib.ts` Eval type gains one optional field:

```typescript
export interface Eval {
  // ... existing fields ...
  /** Optional system-reminder string. Runner prepends as a synthetic
   *  <system-reminder> turn before sending the prompt to claude. Lets
   *  hook-driven evals test the model's response to a reminder in
   *  isolation, without requiring the bash hook to be installed in the
   *  scratch cwd. Mutually informative with `setup`: `setup` is the
   *  end-to-end path (install hook → real hook fires), `additional_context`
   *  is the contract path (skip hook → assert response shape). */
  additional_context?: string;
}
```

Runner change: ~30 lines in `tests/eval-runner-v2.ts` — if `additional_context` is present, runner emits it as a synthetic system-reminder in the prompt envelope before the user prompt. Backward compatible — absent field → current behavior unchanged. Phase 1m's `loadEvalFile` contract gains a one-line shape check for `additional_context` (string-or-absent).

### 4b. `rules-evals/scope-tier-memory-check/evals.json`

Conforms to `loadEvalFile` contract (Phase 1m). Eight evals (revised from six to cover new criteria):

**End-to-end evals** (use `setup` to write `.claude/settings.local.json` into scratch cwd registering the absolute path of the hook script — exercises the real hook code path):

1. **`pr-330-canonical`** — verbatim PR #330 prompt shape with `pipeline` in the prompt. Memory fixture loads `feedback_right_size_ceremony.md`. Real hook fires `additionalContext` with `SCOPE-TIER MATCH:`. Assertions:
   - System-reminder includes `SCOPE-TIER MATCH:` prefix (positive)
   - Response contains `[Scope-tier match: feedback_right_size_ceremony]` ack line
   - Response does NOT invoke `Skill(define-the-problem)`
2. **`pressure-framing-minimizer`** — prompt: *"just a quick fix to planning.md, small change"*. Hook does NOT fire (minimizer present). Assertions:
   - No `SCOPE-TIER MATCH:` reminder
   - Response invokes `Skill(define-the-problem)` per pressure-framing floor
3. **`large-scope-keyword`** — prompt: *"rearchitect the rules system, refactor across the front-door layer"*. Mechanical verb present but verb-based scope-expander present. Hook does NOT fire. Assertions:
   - No `SCOPE-TIER MATCH:` reminder
   - Standard pipeline routing
4. **`no-matching-memory`** — clean mechanical-verb prompt, but no scope-tier feedback memory loaded in fixture. Hook does NOT fire. Assertions:
   - No `SCOPE-TIER MATCH:` reminder
   - Pressure-framing floor evaluates normally
5. **`sentinel-bypass-active`** — all match conditions, but `DISABLE_PRESSURE_FLOOR` sentinel present. Hook exits 0 early. Assertions:
   - No `SCOPE-TIER MATCH:` reminder
   - Bypass behavior visible (no DTP routing on pressure-framing grounds either)
6. **`blast-radius-public-api`** *(NEW — covers criterion #5)* — prompt: *"rename the exported `serializePayload` symbol in `api/v1/checkout.ts`"*. Mechanical verb + concrete target + no minimizer + no scope-expander, BUT: `api/` path + `exported` word both trigger blast-radius rejection. Hook does NOT fire. Assertions:
   - No `SCOPE-TIER MATCH:` reminder
   - Pipeline routing per pressure-framing floor / DTP
7. **`git-working-tree-large`** *(NEW — covers criterion #6)* — scratch cwd `setup` seeds 8 dummy modified files via `git add -N`. Prompt: *"rename `helperA` to `helperB` in `src/utils/foo.ts`"*. Hook reads diff, sees > 5 files in flight → REJECTS. Assertions:
   - No `SCOPE-TIER MATCH:` reminder
   - Standard pipeline routing (large in-flight work invalidates the "small mechanical" claim)

**Routing-contract evals** (use new `additional_context` field — skips real hook, injects synthetic system-reminder, tests Layer 2 routing in isolation):

8. **`routing-contract-positive`** — `additional_context`: `"SCOPE-TIER MATCH: feedback_right_size_ceremony. Per stored feedback..."`. Prompt: *"prune the dead code from `lib/foo.ts`"*. Assertions:
   - Response contains `[Scope-tier match: feedback_right_size_ceremony]` ack line
   - Response does NOT invoke `Skill(define-the-problem)`
9. **`hook-not-installed`** — same prompt as `pr-330-canonical` but fixture omits `additional_context` AND omits the `setup` hook install. Real degradation case — no reminder reaches the model. Assertions:
   - No `SCOPE-TIER MATCH:` reminder (graceful degradation)
   - Layer 2 rule text alone does NOT force routing (V1 soft check; documents expected degradation behavior)
10. **`routing-contract-conflict-challenge`** *(NEW)* — `additional_context` injects a `SCOPE-TIER MATCH:` reminder, BUT the prompt mentions an obviously large concern: *"rename `Foo` to `Bar` across the public SDK — this will break all downstream consumers."*. Tests the "if you believe the hook fired incorrectly, name the signal that's wrong and ask the user" branch of the rule text. Assertions:
   - Response challenges the match (contains text matching `incorrectly|wrong signal|confirm direct implementation`)
   - Response does NOT silently route to direct implementation

### 5. `tests/fixtures/scope-tier-memory-check/` directory

Ten subdirectories (one per eval). Each contains:
- `prompt.md` — user prompt under test
- `memory/MEMORY.md` — fixture memory index (verbatim or stub)
- `memory/<entry>.md` — referenced memory entry files
- `setup.sh` *(end-to-end evals only)* — shell snippet written into the eval's `setup:` field; installs hook config + seeds any required filesystem state
- For `sentinel-bypass-active`: `setup.sh` creates `.claude/DISABLE_PRESSURE_FLOOR`
- For `git-working-tree-large`: `setup.sh` runs `git init` + `git add -N` on 8 dummy files
- For routing-contract evals: no `setup.sh`; eval entry uses `additional_context` field directly

Plus `README.md` per Phase 1n describing the end-to-end / routing-contract split.

### 6. `tests/hooks/scope-tier-memory-check.test.sh`

Shell tests for the hook script directly (no model in the loop). Pattern from `hooks/test-block-dangerous-git.sh`. Covers each of the six criteria in isolation + conjunctive combinations + sentinel + environmental edge cases:

- **Criterion 1 — verb signal**: each verb in the canonical list triggers; verbs not in the list don't
- **Criterion 2 — concrete target**: file path / backtick symbol / line ref / registry entry all match; bare nouns don't
- **Criterion 3 — minimizer absence**: each minimizer in the canonical list rejects; absent minimizers don't reject
- **Criterion 4 — scope-expander absence**: each scope-expander phrase rejects; absent phrases don't reject
- **Criterion 5 — blast-radius absence** *(NEW)*: each blast-radius path pattern rejects; each blast-radius word/phrase rejects; absent → no rejection
- **Criterion 6 — git working-tree size absence** *(NEW)*:
  - In-flight 6+ files via mocked `git diff --cached --stat` → rejects
  - In-flight > 200 LOC → rejects
  - In-flight migrations/ file → rejects
  - In-flight 0 files → no rejection
  - Not in git repo → no rejection (graceful)
  - `git` binary missing → no rejection (graceful, simulated via PATH manipulation)
  - `timeout 2s` cap → kills hang, no rejection
- **Conjunctive**: every match positive AND every absence negative → fires; any single failure → no fire
- **Sentinel bypass**: project-local + global paths both bypass
- **Output**: JSON validity round-trip through `jq`; emission line format
- **Logging**: log file written with per-criterion breakdown; truncation at 10 MB

Plus `tests/hooks/scope-tier-memory-check-log-rotation.test.sh` — explicit test for the new log rotation behavior.

These tests cover the *mechanical* layer. The eval suite covers the *integrated* model behavior.

### 7. `validate.fish` registry updates

- **Phase 1f**: add subsection label `Scope-tier memory check` to the `planning.md` required-labels registry.
- **Phase 1g**: register the canonical keyword lists (verb list, minimizer list, scope-expander list, blast-radius path patterns, blast-radius words, scope-tier-memory-keyword list, emission line format) so restatement outside `hooks/scope-tier-memory-check.sh` AND `rules/planning.md` fails CI. Hook script is the canonical source for the lists; planning.md references them by description, not by enumeration.
- **Phase 1j**: add `#scope-tier-memory-check` to the stable-anchor registry.
- **Phase 1l**: no immediate dependent rules link to `#scope-tier-memory-check`. Skip registration for now.
- **Phase 1o (NEW)**: hook script presence + executable bit + shellcheck pass. Registers `hooks/scope-tier-memory-check.sh` and `bin/install-scope-tier-hook.fish` as required artifacts. Also asserts `tests/evals-lib.ts` Eval interface includes the optional `additional_context` field (substrate adaptation contract — closes "spec assumes substrate change but doesn't enforce it" risk).
- **Phase 1m / 1n**: automatic coverage for evals + fixtures.

### 8. Test coverage for new validate.fish phase

- `tests/validate-phase-1f.test.ts` — assert new label entry present; assert failure when removed.
- `tests/validate-phase-1g.test.ts` — assert canonical lists registered; assert failure when restated outside hook + planning.md.
- `tests/validate-phase-1j.test.ts` — assert `#scope-tier-memory-check` present; assert failure when anchor removed.
- `tests/validate-phase-1o.test.ts` *(new)* — assert hook script presence, executable bit, shellcheck clean; assert installer presence.

### 9. `rules/README.md` table update

Update validate.fish phase table to mention Phase 1o coverage for hook artifacts. No new rule-file row.

## Data Flow

```
User prompt arrives
  ↓
UserPromptSubmit hook fires (if installed)
  ↓
hooks/scope-tier-memory-check.sh:
  ├─ check DISABLE_PRESSURE_FLOOR sentinel → exit 0 if present
  ├─ read MEMORY.md → exit 0 if not present
  ├─ scan for scope-tier memory entries → exit 0 if none
  ├─ apply 6 conjunctive criteria to prompt:
  │   1. verb signal present (REQUIRED positive)
  │   2. concrete-target signal present (REQUIRED positive)
  │   3. minimizer absent (REQUIRED negative)
  │   4. scope-expander absent (REQUIRED negative)
  │   5. blast-radius signal absent (REQUIRED negative — NEW)
  │   6. git working-tree size below thresholds (REQUIRED negative — NEW)
  ├─ log per-criterion result + decision to ~/.claude/logs/scope-tier-hook.log
  ├─ rotate log if > 10 MB
  └─ if all 6 criteria pass: emit additionalContext JSON with SCOPE-TIER MATCH: prefix
  ↓
Claude Code injects emission as <system-reminder>
  ↓
Model receives prompt + reminder
  ↓
planning.md step 1 evaluated:
  1. Scope-tier memory check (Layer 2 — responds to reminder)
     ├─ if SCOPE-TIER MATCH: reminder present:
     │    emit [Scope-tier match: …] ack line
     │    route to direct implementation
     │    (skip DTP/SA/brainstorm/FMS)
     └─ else: fall through to (2)
  2. Pressure-framing floor (existing, unchanged)
  3. Named-cost skip emission contract (existing, unchanged)
  4. DTP invocation (existing, unchanged)
  ↓
execution-mode.md announces mode (single-implementer if scope-tier match)
  ↓
implementation → goal-driven.md per-step verify checks → verification.md end-of-work gate
```

## Measurement Plan

### Phase 1 (this PR): Canonical Regression Coverage

- Ten evals cover: canonical positive (PR #330 shape), canonical negatives (pressure framing, scope expander, no memory, bypass, no hook), the two new criterion negatives (blast-radius public-API path, git working-tree large), and three routing-contract evals (positive isolation, degradation, conflict-challenge).
- Hook script logs every decision (per-criterion result + match/no-match + git pre-check counts + prompt hash) to `~/.claude/logs/scope-tier-hook.log` with 10 MB rotation.
- No FP/FN rate measurement in Phase 1 — log accumulation begins.
- **Initial sanity check at merge time**: replay the hook against the prior 30 days of `~/.claude/logs/claude-code-*.log` prompts (if available) as a one-time cold-start measurement. Provides a *first* signal of FP/FN distribution before the live telemetry stream begins.

### Phase 2 (30 days post-merge): Corpus Eval

- File follow-up issue at merge time: "scope-tier hook corpus eval — measure FP/FN against 30-day log".
- Pull 50 prompts from `~/.claude/logs/scope-tier-hook.log` (stratified: 25 match, 25 no-match).
- Manually label each as truly-scope-tier vs truly-needs-pipeline.
- Compute precision (match-positives that were truly scope-tier) and recall (truly-scope-tier prompts the hook caught).
- **Acceptance for Phase 2**: precision ≥ 0.90 (FP rate ≤ 10% — wrong-tier routing is costly), recall ≥ 0.70 (FN rate ≤ 30% — partial coverage acceptable because Layer 2 rule text + Trivial-tier check + memory-discipline still provide backstops).
- If thresholds miss, criteria adjustment + re-run; track in same follow-up issue.

### Phase 3 (if Phase 2 reveals systemic gaps): Tool-Use Forcing

- If reminder-only Layer 1 has recall < 0.70 even after criteria tuning, escalate to tool-use forcing: require model invoke `acknowledge_scope_tier_match` MCP tool when reminder fires. Mirrors `acknowledge_named_cost_skip` pattern.
- Out of scope for this PR — gated on Phase 2 evidence.

## Error Handling

- **Memory not loaded (clean slate session)**: hook reads MEMORY.md, finds no scope-tier entries, exits 0. No reminder. Model behavior unchanged.
- **Multiple scope-tier memories loaded**: hook emits one reminder listing all matching memory names. Model ack line lists all in single emission.
- **Ambiguous verb / target**: hook uses literal substring match on canonical lists. False negative is recoverable (user re-prompts); false positive is the failure mode #332 closes (caught by Phase 2 measurement).
- **MEMORY.md unreadable** (permissions, missing file): hook exits 0 silently. Prompts never blocked due to scanner failure. Log entry records the read failure for diagnostic.
- **Sentinel file unreadable**: treat as not present (conservative — bypass requires explicit file presence).
- **Hook not installed in user settings**: graceful degradation. Layer 2 rule text becomes a soft check that may or may not fire depending on model vigilance. `bin/install-scope-tier-hook.fish` is idempotent — re-running fixes drift.
- **Hook script crash or jq missing**: Claude Code's hook timeout / error handling kicks in — prompt proceeds without reminder. Log file captures the crash for diagnostic.
- **Not in a git repo (criterion 6)**: git pre-check skipped, no rejection. Hook still evaluates all other criteria.
- **`git` binary missing or unresponsive**: `timeout 2s` cap kills the call; pre-check skipped, no rejection. Hook still evaluates other criteria.
- **Large `git diff --stat` output (perf)**: `git diff --stat` itself bounded by the 2s timeout. Even on 100k-line diffs, the stat summary is sub-second. No measured concern.
- **Pre-commit hook output piped into the working-tree size check**: hook reads `git diff --cached --stat` via pipe to `awk`-bounded line count; no interactive prompts.
- **Phase 1g registers blast-radius lists in addition to verb/minimizer/scope-expander lists**: keeps the canonical source single (hook script) and catches restatement drift in planning.md or elsewhere.

## Testing

**Unit / mechanical (hook layer)**:
- `tests/hooks/scope-tier-memory-check.test.sh` — covers each criterion in isolation, conjunctive combinations, sentinel bypass paths, malformed input, output JSON validity. Pattern from existing `hooks/test-block-dangerous-git.sh`.
- shellcheck clean on hook script (enforced by Phase 1o).

**Unit / mechanical (validate.fish)**:
- `tests/validate-phase-1f/1g/1j/1o.test.ts` — registry presence + failure-when-violated.

**Integration / eval-substrate**:
- `rules-evals/scope-tier-memory-check/evals.json` — six evals against the live model with hook simulated (eval substrate injects the hook's `additionalContext` output as a system-reminder per fixture).
- `pr-330-canonical` is the canonical regression test.
- `hook-not-installed` documents graceful degradation as a deliberate behavior.

**End-to-end (manual)**:
- Fresh session with hook installed, `feedback_right_size_ceremony.md` loaded, PR #330-shape prompt → observe `SCOPE-TIER MATCH:` reminder + ack line + direct routing.
- Same session with sentinel present → observe no reminder, no ack, pressure-framing floor evaluates normally.
- Same session with hook uninstalled → observe degraded behavior (no reminder; rule text may or may not fire).

## Rollout

Purely additive. Implementation order:

1. **Land substrate adaptation**: `additional_context` field on Eval shape in `tests/evals-lib.ts` + runner emission in `tests/eval-runner-v2.ts` + Phase 1m contract update. Bun test for substrate field.
2. **Land hook script + tests**: `hooks/scope-tier-memory-check.sh` (all 6 criteria + log rotation), `tests/hooks/scope-tier-memory-check.test.sh`, `tests/hooks/scope-tier-memory-check-log-rotation.test.sh`. Shellcheck clean.
3. **Land installer**: `bin/install-scope-tier-hook.fish` + `--check` mode integration into `validate.fish`.
4. **Land Phase 1o validate.fish phase + test**: `tests/validate-phase-1o.test.ts` (hook artifacts + Eval `additional_context` field presence).
5. **Land rule change**: new subsection + stable anchor in `rules/planning.md`. Phases 1f/1g/1j registry updates (1g now includes blast-radius lists).
6. **Land tests for phases 1f/1g/1j extensions**.
7. **Land eval suite + fixtures**: `rules-evals/scope-tier-memory-check/` (10 evals) + `tests/fixtures/scope-tier-memory-check/` (10 subdirs + README).
8. **Re-run full `validate.fish`**: must pass.
9. **Install hook locally**: `fish bin/install-scope-tier-hook.fish`. Verify `~/.claude/settings.json` includes the `UserPromptSubmit` entry.
10. **Fresh-session verification**: open new Claude Code session, issue PR #330-shape prompt, observe reminder + ack + direct routing. Also verify: blast-radius prompt (public API rename) does NOT fire; large in-flight working tree does NOT fire.
11. **Run cold-start sanity check**: replay hook against 30 prior days of session logs, capture FP/FN counts into the merge-PR description.
12. **File Phase 2 follow-up issue** at merge time: scope-tier corpus eval — measure FP/FN against 30-day live telemetry log.

## ADR

File `adrs/0008-scope-tier-memory-check-at-pipeline-entry.md` after this spec lands. Captures:
- Decision: two-layer design (mechanical hook + rule text), extend planning.md step 1 (anchor A), conjunctive precedence (Q3 C), hook-based prompt-surface heuristics (Q2 A revised), narrowed scope-expander list (verb-phrase only).
- Rejected: anchor B (new file — orphan risk + front-door duplication); anchor C (extend memory-discipline.md — invariant contradiction); rule-text-only fix (layer mismatch with failure being fixed); bare-noun scope expanders (collides with PR #330 canonical case); tool-use forcing function (over-intensity for V1 — deferred to Phase 3 if needed).
- Sentinel bypass inheritance (single off-switch).
- Convergence with Trivial/Mechanical tier.
- Phased measurement plan (Phase 1 canonical evals, Phase 2 corpus eval, Phase 3 tool-use forcing if needed).

## Memory Note (post-merge)

Add `~/.claude/projects/-Users-cantu-repos-claude-config/memory/scope_tier_memory_check_anchor.md` noting:
- Canonical home: hook at `hooks/scope-tier-memory-check.sh`; routing rule at `rules/planning.md` step 1 anchor `#scope-tier-memory-check`.
- Two-layer architecture: mechanical hook (detection) + rule text (response).
- Trigger: conjunctive (verb + target + no-minimizer + no-scope-expander + memory match).
- Precedence: fires before pressure-framing floor via system-reminder; convergent with Trivial tier.
- Sentinel: `DISABLE_PRESSURE_FLOOR` inherited.
- Do not relocate without rerunning the inverse-RED audit AND verifying Phase 2 corpus eval thresholds.

## Known Limitations (Tracked as Follow-Up Issues)

These were surfaced in architectural review and explicitly accepted as V1 limitations:

- **Description-field schema coupling (review defect #4)**: scope-tier keyword scan depends on MEMORY.md description field shape. Future MEMORY.md format changes break the scan. Tracked as follow-up: "design memory tag schema for scope-tier and future filtering needs."
- **After-the-fact feedback loop missing (review defect #5)**: Layer 1 hook gives telemetry, but no automated post-merge audit catches misses on real PRs. Tracked as follow-up: "after-merge PR audit: re-run model against original prompt + memories, assert gate fired if it should have." *(Partially mitigated by cold-start sanity check in rollout step 11, which catches the most egregious cases at merge time.)*
- **Verb-list / blast-radius-list maintenance burden (review defect #7, expanded)**: now six hardcoded lists in the hook (scope-tier memory keywords, verb signals, minimizers, scope-expanders, blast-radius paths, blast-radius words). Lists will drift. Phase 1g catches restatement, not list content drift. Tracked as follow-up: "scope-tier criteria evolution: corpus-driven list updates."
- **Coupling map density (review defect #10)**: now 11 surfaces (substrate field, hook, installer, rule, Phase 1f/1g/1j/1o validate.fish + tests, README, plus implicit MEMORY.md schema). End-to-end coverage via the 7 end-to-end evals at fixture level; an integration test that asserts hook stdout → substrate injection → model response → routing decision in one runner pass is deferred. Tracked as follow-up: "scope-tier end-to-end integration test (single bun-test orchestration)."
- **Per-user hook install (confidence-assessment risk)**: hook is installed per-user via `bin/install-scope-tier-hook.fish`, not auto-installed on `fish install.fish`. New contributors mirror PR #330 until they run installer. Documented in README + repo onboarding. Tracked as follow-up: "auto-install scope-tier hook on `fish install.fish` once V1 measurement confirms low FP rate."
- **`additionalContext` format dependency on Claude Code (confidence-assessment risk)**: hook's `{"additionalContext": "..."}` output format depends on Claude Code's stable hook protocol. If Claude Code changes the format, hook silently breaks. Phase 1o asserts hook script presence + shellcheck but doesn't validate against Claude Code's hook contract. Tracked as follow-up: "Claude Code hook contract regression test."

## Out of Scope

Explicitly deferred to future issues / PRs:
- Auto-classification of memory entries as scope-tier vs other (Phase 1 uses description-field keyword scan; Phase 2+ may use richer tagging if measurement shows need)
- Generic memory-relevance classifier (issue #332 body explicitly out-of-scope)
- Memory entry renames or restructuring
- Cross-rule memory propagation patterns
- Updating existing memory entries to add canonical scope-tier keywords (optional follow-up; not blocking — hook gracefully degrades to no-match if no keywords present)
- Renaming `feedback_right_size_ceremony.md` itself
- Tool-use forcing for the routing step (Phase 3, gated on Phase 2 evidence)
- Auto-installing hook on `fish install.fish` (V1 requires explicit `bin/install-scope-tier-hook.fish` invocation; documented in README)
- Cross-project hook (this hook is `claude-config`-specific; portability is out of scope until a second consumer materializes)
