# Design Spec: Scope-Tier Memory Check at Pipeline Entry

**Date**: 2026-05-17
**Status**: Proposed (revised after architectural review)
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

This spec was revised after adversarial review. Three defects were addressed:

1. **Layer-mismatch fix (was defect #1)** — original design was rule-text-only, structurally similar to the failure it was fixing. Revised design is two-layer: a mechanical `UserPromptSubmit` hook (Layer 1) injects a `<system-reminder>` when scope-tier conditions match; the rule text (Layer 2) governs how the model responds to that reminder. Hook removes the model-vigilance dependency for the *detection* step; rule text covers the *routing* step.
2. **Canonical-regression contradiction fix (was defect #2)** — scope-expander list narrowed to verb-based phrases (`redesign`, `restructure`, `rearchitect`, `refactor across`, `migrate to`, `rewrite`, `introduce new`). Bare nouns (`pipeline`, `system`, `architecture`) dropped because they appear in PR #330-shape prompts that the gate is designed to catch.
3. **Measurement-infrastructure fix (was defect #3)** — five canonical evals ship in Phase 1, plus a measurement plan with explicit FP/FN budget and a Phase 2 corpus-eval path that mines session logs after 30 days of hook telemetry.

Defects #4 (description-field schema brittleness), #5 (no after-the-fact feedback loop), #7 (verb-list maintenance), and #10 (coupling map density) are acknowledged in the "Known Limitations" section below and tracked as follow-up issues.

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
6. Apply conjunctive criteria to the prompt:
   - **Verb signal (required)**: prompt contains one of: `prune`, `rename`, `delete`, `trim`, `swap`, `move`, `typo`, `comment-only`, `format-only`, `add row to`, `update entry in`, `remove from`
   - **Concrete-target signal (required)**: prompt matches one of: explicit file path (`*.md`, `*.ts`, etc.), single-quoted backtick symbol, single line reference (`line N`), or named registry entry
   - **Minimizer absence (required)**: prompt does NOT contain any of: `just`, `quick`, `tiny`, `trivial`, `small change`, `simple`
   - **Scope-expander absence (required)**: prompt does NOT contain any of: `redesign`, `restructure`, `rearchitect`, `refactor across`, `migrate to`, `rewrite`, `introduce new`, `cross-cutting change` *(narrowed to verb phrases — bare nouns like "pipeline" and "system" removed because they appear in legitimate scope-tier prompts)*
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
- All keyword lists declared as bash arrays at the top of the script (single source of truth for canonical strings — Phase 1g validates restatement elsewhere)
- Exit 0 on any error reading MEMORY.md (graceful degradation — never block prompts due to scanner failure)
- Output JSON via `jq -n` to guarantee well-formed reminder
- Script logs match decisions to `~/.claude/logs/scope-tier-hook.log` (newline-delimited JSON: timestamp, match-decision, criteria-evaluation, prompt-hash) — provides the telemetry stream for Phase 2 corpus eval

### 2. New installer: `bin/install-scope-tier-hook.fish`

Idempotent fish script that adds the hook to `~/.claude/settings.json`. Pattern mirrors `bin/link-config.fish`. Uses jq to add the `UserPromptSubmit` entry without clobbering existing hooks. Includes `--check` mode for CI.

### 3. New subsection in `rules/planning.md` step 1 (DTP)

Inserted BEFORE the existing `<a id="pressure-framing-floor"></a>` block. Stable anchor `<a id="scope-tier-memory-check"></a>`. Canonical text per "Layer 2" section above.

### 4. `rules-evals/scope-tier-memory-check/evals.json`

Conforms to `loadEvalFile` contract (Phase 1m). Six evals (revised from five):

1. **`pr-330-canonical`** — verbatim PR #330 prompt shape with `pipeline` in the prompt. Hook fires `additionalContext` with `SCOPE-TIER MATCH:`. Assertions:
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
6. **`hook-not-installed`** *(new)* — same prompt as `pr-330-canonical` but fixture omits hook registration. Assertions:
   - No `SCOPE-TIER MATCH:` reminder (graceful degradation)
   - Layer 2 rule text alone does NOT force routing (V1 soft check; documents the expected degradation behavior)

### 5. `tests/fixtures/scope-tier-memory-check/` directory

Six subdirectories (one per eval). Each contains:
- `prompt.md` — user prompt under test
- `memory/MEMORY.md` — fixture memory index (verbatim or stub)
- `memory/<entry>.md` — referenced memory entry files
- `hook-config.json` — fixture settings.json snippet (hook registered or not, depending on eval)
- For `sentinel-bypass-active`: `.claude/DISABLE_PRESSURE_FLOOR` sentinel file

Plus `README.md` per Phase 1n.

### 6. `tests/hooks/scope-tier-memory-check.test.sh`

Shell tests for the hook script directly (no model in the loop). Pattern from `hooks/test-block-dangerous-git.sh`. Covers:
- Each criterion in isolation (verb match, target match, minimizer rejection, scope-expander rejection)
- Conjunctive combinations (positive verb + minimizer → no fire; positive verb + target + no minimizer + no expander → fire)
- Sentinel bypass at both paths (project-local, global)
- Missing MEMORY.md (graceful exit)
- Malformed JSON input (graceful exit)
- Output JSON validity (round-trip through jq)

These tests cover the *mechanical* layer. The eval suite covers the *integrated* model behavior.

### 7. `validate.fish` registry updates

- **Phase 1f**: add subsection label `Scope-tier memory check` to the `planning.md` required-labels registry.
- **Phase 1g**: register the canonical keyword lists (verb list, minimizer list, scope-expander list, scope-tier-memory-keyword list, emission line format) so restatement outside `hooks/scope-tier-memory-check.sh` AND `rules/planning.md` fails CI. Hook script is the canonical source for the lists; planning.md references them by description, not by enumeration.
- **Phase 1j**: add `#scope-tier-memory-check` to the stable-anchor registry.
- **Phase 1l**: no immediate dependent rules link to `#scope-tier-memory-check`. Skip registration for now.
- **Phase 1o (NEW)**: hook script presence + executable bit + shellcheck pass. Registers `hooks/scope-tier-memory-check.sh` and `bin/install-scope-tier-hook.fish` as required artifacts.
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
  ├─ apply 4 conjunctive criteria to prompt
  ├─ log decision to ~/.claude/logs/scope-tier-hook.log
  └─ if match: emit additionalContext JSON with SCOPE-TIER MATCH: prefix
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

- Six evals cover canonical positive (PR #330 shape) and canonical negatives (pressure framing, scope expander, no memory, bypass, no hook).
- Hook script logs every decision (match/no-match + criteria evaluation + prompt hash) to `~/.claude/logs/scope-tier-hook.log`.
- No FP/FN rate measurement in Phase 1 — log accumulation begins.

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

1. **Land hook script + tests**: `hooks/scope-tier-memory-check.sh`, `tests/hooks/scope-tier-memory-check.test.sh`. Shellcheck clean.
2. **Land installer**: `bin/install-scope-tier-hook.fish` + `--check` mode integration into `validate.fish`.
3. **Land Phase 1o validate.fish phase + test**: `tests/validate-phase-1o.test.ts`. Run full `validate.fish`.
4. **Land rule change**: new subsection + stable anchor in `rules/planning.md`. Phases 1f/1g/1j registry updates.
5. **Land tests for phases 1f/1g/1j extensions**.
6. **Land eval suite + fixtures**: `rules-evals/scope-tier-memory-check/` + `tests/fixtures/scope-tier-memory-check/`.
7. **Re-run full `validate.fish`**: must pass.
8. **Install hook locally**: `fish bin/install-scope-tier-hook.fish`. Verify `~/.claude/settings.json` includes the `UserPromptSubmit` entry.
9. **Fresh-session verification**: open new Claude Code session, issue PR #330-shape prompt, observe reminder + ack + direct routing.
10. **File Phase 2 follow-up issue** at merge time: scope-tier corpus eval — measure FP/FN against 30-day log.

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
- **After-the-fact feedback loop missing (review defect #5)**: Layer 1 hook gives telemetry, but no automated post-merge audit catches misses on real PRs. Tracked as follow-up: "after-merge PR audit: re-run model against original prompt + memories, assert gate fired if it should have."
- **Verb-list maintenance burden (review defect #7)**: three hardcoded lists (verbs, minimizers, scope-expanders). Lists will drift. Phase 1g catches restatement, not list content drift. Tracked as follow-up: "scope-tier criteria evolution: corpus-driven list updates."
- **Coupling map density (review defect #10)**: nine surfaces (hook, installer, rule, four eval/test files, README, plus implicit MEMORY.md schema). No end-to-end integration test asserts hook output → model behavior → final routing. Tracked as follow-up: "scope-tier end-to-end integration test."

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
