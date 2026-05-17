# Design Spec: Scope-Tier Memory Check at Pipeline Entry

**Date**: 2026-05-17
**Status**: Proposed
**Related**:
- [Issue #332](https://github.com/chriscantu/claude-config/issues/332) — postmortem of PR #330 scope-tier memory miss
- [PR #330](https://github.com/chriscantu/claude-config/pull/330) — closed, superseded by [PR #331](https://github.com/chriscantu/claude-config/pull/331)
- `rules/planning.md` — front-door HARD-GATE; this spec extends step 1
- `rules/memory-discipline.md` — turn-local memory cite-and-ask gate (unchanged by this spec)
- Memory: `~/.claude/projects/-Users-cantu-repos-claude-config/memory/feedback_right_size_ceremony.md` — the canonical scope-tier feedback memory that PR #330 ignored
- Memory: `~/.claude/projects/-Users-cantu-repos-claude-config/memory/per_gate_floor_blocks_substitutable.md` — establishes that DTP step 1 is the canonical anchor for floor mechanics
- [ADR #0006](../../../adrs/0006-systems-analysis-pressure-framing-floor.md) — rejection precedent for per-gate floor duplication
- [ADR #0007](../../../adrs/0007-rules-pruning-substitutable-blocks.md) — establishes substitutability of per-gate blocks

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

**Known Unknowns**:
- Whether prompt-surface heuristics alone (verb class + named target + minimizer absence) hit acceptable false-positive/false-negative rates without semantic analysis. Eval suite will measure.
- Whether scope-tier check + Trivial-tier four-criteria check ever disagree in practice (both route to direct implementation; collision is convergent, not divergent)
- Whether future memory entries with scope-tier semantics will need explicit tagging to be discoverable by the keyword scan, or whether description-field keywords stay sufficient

## Systems Analysis Summary

**Dependencies**: `rules/planning.md` (anchor host); `rules/memory-discipline.md` (unchanged but referenced); `rules/README.md` (Phase 1g registry table); `validate.fish` Phase 1f/1g/1j (anchor + canonical-string + delegate registries); `rules-evals/scope-tier-memory-check/` (new eval suite); `tests/fixtures/scope-tier-memory-check/` (new fixtures + README per Phase 1n); existing memory infrastructure (system-prompt MEMORY.md injection at session start).

**Second-order effects**: Positive — closes the PR #330 failure class; reuses the front-door anchor pattern (no architectural drift); provides a fast-path into the same destination as Trivial/Mechanical tier (convergent routing). Negative — risks: false positives route genuinely-needs-pipeline work to direct implementation (mitigated by conjunctive trigger requiring multiple positive signals AND minimizer absence); precedence interactions with pressure-framing floor (mitigated by conjunctive precedence requiring NO pressure-framing minimizers); over-trigger on prompts that look mechanical but are large (mitigated by scope-expanding-keyword exclusion).

**Failure modes**: classifier false negative (memory match missed → PR #330 recurs); classifier false positive (large work routed to direct implementation → opposite-direction same-class failure); precedence collision with pressure-framing floor (mitigated by conjunctive trigger design); sentinel-bypass inheritance ambiguity (mitigated by explicit declaration in gate text); eval drift (mitigated by Phase 1m/1n contracts already in place).

**Org impact**: Single-maintainer repo, fully reversible (rule additions revertible via git, no migration). Visible behavior change in fresh sessions: small mechanical prompts route to direct implementation; users will see scope-tier emission line instead of DTP invocation. Documentation surface: README Phase 1g registry update; one ADR; one memory note.

## Selected Approach

**Anchor A** (extend `planning.md` step 1 DTP preamble) over alternatives:
- **B** (new `rules/pipeline-entry-check.md`): rejected — orphan-rule risk if no dependent rules delegate to it; duplicates the front-door anchor pattern; adds symlink + validate.fish registry + README row for no architectural gain.
- **C** (extend `rules/memory-discipline.md`): rejected — contradicts the architectural invariant *"front-door enforcement lives in rules layer because it fires BEFORE any skill loads — a skill cannot catch its own failure-to-load"*. Memory-discipline currently fires turn-locally on recommendations; mixing pipeline-entry firing into the same rule splits its firing modes incoherently.

**Trigger detection — prompt-surface heuristics only** (A from brainstorm Q2):
- Match condition is conjunctive (ALL must hold):
  1. At least one scope-tier `feedback` memory loaded (description field contains one of: `right-size`, `small/mechanical`, `skip DTP`, `skip SA`, `ceremony`, `scope tier`)
  2. Prompt contains a positive mechanical verb: `prune`, `rename`, `delete`, `trim`, `swap`, `move`, `typo`, `comment`, `format`, `add row to`, `update entry in`
  3. Prompt names a concrete target: single file path, single symbol, single line, or single registry entry
  4. Prompt contains NO pressure-framing minimizer: `just`, `quick`, `tiny`, `trivial`, `small change`, `simple`
  5. Prompt contains NO scope-expanding signal: `system`, `architecture`, `refactor across`, `migrate`, `platform`, `pipeline`, `cross-cutting`

**Precedence — conjunctive (C from brainstorm Q3)**: scope-tier check fires FIRST at pipeline entry. On match, route to direct implementation (skip DTP/SA/brainstorm/FMS). On no-match, current pressure-framing floor and DTP-entry behavior evaluate normally. By construction (criterion 4), a matching prompt is NOT a pressure-framed prompt — no ordering ambiguity.

**Why conjunctive precedence and not "scope-tier wins outright":** the pressure-framing floor exists because "just a small change" is often pressure framing, not a tier claim (per `per_gate_floor_blocks_substitutable.md` and ADR #0006). Allowing scope-tier check to override pressure framing on bare minimizer wording reopens the exact failure mode the floor exists to close. Requiring concrete mechanical verb + named target + minimizer absence isolates the scope-tier signal from the pressure-framing signal.

**Why prompt-surface heuristics and not Bash pre-check:** the PR #330 failure was prompt-time misclassification, not post-diff misclassification. The work hadn't been started yet — Bash pre-check would have nothing to measure. Hybrid over-engineers for the case Bash adds signal (in-flight edits). Cheap and deterministic wins.

**Action on match**: emit `[Scope-tier match: <memory-name>] Routing to direct implementation per stored feedback.` (visible single-line emission, no MCP tool invocation — this is agent-detected, not user-named-cost skip). Route to direct implementation. `execution-mode.md` single-implementer mode, `goal-driven.md` per-step verify checks, and `verification.md` end-of-work gate all still apply.

## Architecture

Five components, all additive:

### 1. New subsection in `rules/planning.md` step 1 (DTP)

Inserted BEFORE the existing `<a id="pressure-framing-floor"></a>` block. Stable anchor `<a id="scope-tier-memory-check"></a>` precedes the subsection heading.

Subsection structure (canonical text):

```markdown
<a id="scope-tier-memory-check"></a>
**Scope-tier memory check (fires BEFORE pressure-framing floor).** At pipeline
entry, scan loaded `feedback` memory entries for scope-tier semantics — entries
whose `description` field in `MEMORY.md` contains one of: `right-size`,
`small/mechanical`, `skip DTP`, `skip SA`, `ceremony`, `scope tier`.

If a scope-tier memory is loaded AND the prompt meets ALL of:
1. Contains a positive mechanical verb: `prune`, `rename`, `delete`, `trim`,
   `swap`, `move`, `typo`, `comment`, `format`, `add row to`, `update entry in`
2. Names a concrete target (single file path, single symbol, single line, or
   single registry entry)
3. Contains NO pressure-framing minimizer (`just`, `quick`, `tiny`, `trivial`,
   `small change`, `simple`)
4. Contains NO scope-expanding signal (`system`, `architecture`, `refactor
   across`, `migrate`, `platform`, `pipeline`, `cross-cutting`)

→ Cite the matched memory, emit the literal line:

> `[Scope-tier match: <memory-name>] Routing to direct implementation per stored feedback.`

→ Route to direct implementation. Skip DTP, Systems Analysis, brainstorming,
Fat Marker Sketch, and subagent-driven-development. `execution-mode.md`
single-implementer mode, `goal-driven.md` per-step verify checks, and
`verification.md` end-of-work gate STILL apply.

If conditions do not match, proceed to the pressure-framing floor below
(current behavior unchanged).

**Sentinel bypass inheritance.** When `DISABLE_PRESSURE_FLOOR` sentinel is
present (project-local OR global per the bypass spec below), the scope-tier
check is ALSO bypassed — same off-switch, no second flag. Rationale: bypass
exists for emergency rollback; splitting into two switches defeats rollback
semantics.

**Precedence vs Trivial/Mechanical tier.** The scope-tier check is a fast-path
into the same destination as the Trivial tier (skip DTP/SA/brainstorm/FMS,
single-implementer mode). On match, jump straight to direct implementation;
Trivial-tier four-criteria check remains the fallback for prompts WITHOUT a
matching scope-tier memory but WITH all four criteria satisfiable from the
prompt. Both routes converge — no collision.

**Precedence vs Expert Fast-Track.** Scope-tier match wins; Fast-Track still
runs DTP (condensed), which scope-tier match skips entirely. The whole point
of scope-tier routing is "don't run pipeline at all."
```

### 2. `rules-evals/scope-tier-memory-check/evals.json`

Conforms to `loadEvalFile` contract (Phase 1m). Five evals:

1. **`pr-330-canonical`** — verbatim PR #330 prompt shape (`prune the per-gate floor blocks in rules/*.md`). Memory context loads `feedback_right_size_ceremony.md` + `per_gate_floor_blocks_substitutable.md`. Assertions:
   - Response contains `[Scope-tier match: feedback_right_size_ceremony]` prefix
   - Response does NOT invoke `Skill(define-the-problem)` (negative `tool_input_matches`)
   - Response proceeds to direct implementation indicators

2. **`pressure-framing-minimizer`** — prompt: *"just a quick fix to planning.md, small change"*. Same memory loaded. Assertions:
   - Response does NOT contain `[Scope-tier match:` prefix
   - Response invokes `Skill(define-the-problem)` (positive `tool_input_matches`)

3. **`large-scope-keyword`** — prompt: *"rename anchor across the entire rules system, refactor the front-door architecture"*. Mechanical verb present but scope-expanding signal present. Assertions:
   - Response does NOT contain `[Scope-tier match:` prefix
   - Response routes to standard pipeline

4. **`no-matching-memory`** — clean mechanical-verb prompt, but no scope-tier feedback memory loaded in fixture. Assertions:
   - Response does NOT contain `[Scope-tier match:` prefix
   - Response evaluates pressure-framing floor normally

5. **`sentinel-bypass-active`** — scope-tier conditions all match, but `DISABLE_PRESSURE_FLOOR` sentinel present. Assertions:
   - Response does NOT contain `[Scope-tier match:` prefix
   - Bypass behavior fires (no DTP routing on pressure-framing grounds either)

Eval shape mirrors existing `rules-evals/pressure-framing-floor/evals.json` for consistency.

### 3. `tests/fixtures/scope-tier-memory-check/` directory

One subdirectory per eval (5 total). Each subdirectory contains:
- `prompt.md` — the user prompt under test
- `memory/MEMORY.md` — fixture memory index (verbatim or stub depending on eval)
- `memory/<entry>.md` — referenced memory entry files

Plus `README.md` describing the fixture-to-eval contract (Phase 1n requirement). Each fixture subdirectory must be consumed by an eval in `rules-evals/scope-tier-memory-check/evals.json` or listed under `## Orphaned fixtures` heading.

### 4. `validate.fish` registry updates

- **Phase 1f**: add new subsection label `Scope-tier memory check` to the `planning.md` required-labels registry.
- **Phase 1g**: register the canonical strings (verb list, minimizer list, scope-expander list, emission line format) so restatement outside `planning.md` fails CI. Mirror the existing Trivial-tier criteria registration pattern.
- **Phase 1j**: add `#scope-tier-memory-check` to the stable-anchor registry. Catches future removal of the explicit `<a id>` line.
- **Phase 1l**: no immediate dependent rules link to `#scope-tier-memory-check`. Skip registration for now. Add when a dependent rule cites it.
- **Phase 1m / 1n**: automatic coverage once eval suite + fixtures land. No registry change needed.

### 5. Test coverage for validate.fish phase extensions

- `tests/validate-phase-1f.test.ts` (new or extension) — assert new label entry present in registry; assert failure when label removed from `planning.md`.
- `tests/validate-phase-1g.test.ts` (existing) — extend to assert new canonical strings registered; assert failure when restated outside `planning.md`.
- `tests/validate-phase-1j.test.ts` (existing or new) — extend to assert `#scope-tier-memory-check` present in registry; assert failure when anchor removed from `planning.md`.

### 6. `rules/README.md` table update

No new row (extension to `planning.md`, not a new rule file). Update the validate.fish phase table description to mention scope-tier check coverage in Phase 1g/1j entries.

## Data Flow

```
Session start
  → ~/.claude/rules/ symlinks load (including planning.md)
  → MEMORY.md index injected into system prompt
User prompt arrives
  → planning.md step 1 evaluated:
    1. Scope-tier memory check (NEW)
       ├─ scan loaded memory descriptions for scope-tier keywords
       ├─ if match AND all 4 prompt conditions hold AND no sentinel:
       │    emit [Scope-tier match: …] line
       │    route to direct implementation (skip DTP/SA/brainstorm/FMS)
       └─ else: fall through to (2)
    2. Pressure-framing floor (existing, unchanged)
    3. Named-cost skip emission contract (existing, unchanged)
    4. DTP invocation (existing, unchanged)
  → execution-mode.md announces mode (single-implementer if scope-tier match)
  → implementation
  → goal-driven.md per-step verify checks
  → verification.md end-of-work gate
```

## Error Handling

- **Memory not loaded** (clean slate session): scope-tier scan returns no match; falls through to current behavior. No error.
- **Multiple scope-tier memories loaded**: emit one match line per matched memory (each on its own line), then route. No tiebreak needed — all matched memories converge on same routing.
- **Ambiguous verb** (e.g., prompt uses `update` which is not on the canonical verb list): not a match. Conservative bias — false negative is recoverable (user can prompt again with explicit verb or accept pipeline overhead); false positive is the failure mode #332 closes.
- **Memory loaded but description field lacks scope-tier keywords**: not a match. V1 keyword scan is intentionally narrow. Future memory entries with scope-tier semantics should include one of the canonical keywords in their `description:` field.
- **Sentinel file unreadable** (permissions, etc.): treat as not present (same as current pressure-framing floor sentinel semantics). Conservative bias — bypass requires explicit file presence.

## Testing

**Unit / mechanical**:
- `validate.fish` runs full pass after every change in implementation order (1 → 2 → 3 → 4 → 5 → 6 above).
- `tests/validate-phase-1f.test.ts`, `1g.test.ts`, `1j.test.ts` extensions cover registry presence + failure when contract violated.

**Integration / eval-substrate**:
- `rules-evals/scope-tier-memory-check/evals.json` runs all 5 evals against the live model.
- `pr-330-canonical` is the canonical regression test — if it ever fails, the gate has regressed and PR #330 class will recur.

**Fresh-session reload verification**:
- `./bin/verify-rule-loaded.fish planning` after merge confirms reload picks up the new subsection.

**Manual verification**:
- Open a fresh session with `feedback_right_size_ceremony.md` loaded; issue a small mechanical prompt mirroring PR #330's shape; observe scope-tier match emission and direct routing.
- Open a fresh session with `DISABLE_PRESSURE_FLOOR` sentinel present; issue the same prompt; observe bypass behavior (no match, no DTP).

## Rollout

Purely additive — no migration. Implementation order:

1. Land changes in `rules/planning.md` (new subsection + stable anchor)
2. Land `validate.fish` phase registry updates (1f, 1g, 1j)
3. Land test coverage for the new phase registry entries
4. Land eval suite + fixtures (`rules-evals/scope-tier-memory-check/` + `tests/fixtures/scope-tier-memory-check/`)
5. Re-run full `validate.fish`: must pass
6. Fresh-session verification via `./bin/verify-rule-loaded.fish planning`
7. Manual verification of scope-tier emission on PR #330-shape prompt

## ADR

File `adrs/0008-scope-tier-memory-check-at-pipeline-entry.md` after this spec lands. Captures:
- Decision: extend planning.md step 1 (anchor A); conjunctive precedence (Q3 C); prompt-surface heuristics (Q2 A)
- Rejected: anchor B (new file — orphan risk + front-door duplication); anchor C (extend memory-discipline.md — invariant contradiction); precedence A (scope-tier wins outright — reopens pressure-framing failure class); precedence B (pressure-framing wins outright — preserves PR #330 failure class)
- Sentinel bypass inheritance (single off-switch)
- Convergence with Trivial/Mechanical tier

## Memory Note (post-merge)

Add `~/.claude/projects/-Users-cantu-repos-claude-config/memory/scope_tier_memory_check_anchor.md` noting:
- Canonical home: `rules/planning.md` step 1, anchor `#scope-tier-memory-check`
- Trigger: conjunctive (verb + target + no-minimizer + no-scope-expander + memory match)
- Precedence: fires before pressure-framing floor; convergent with Trivial tier
- Do not relocate without rerunning the inverse-RED audit (4-cell matrix: with/without scope-tier check × small-mechanical/large-ambiguous prompts)

Format mirrors existing `per_gate_floor_blocks_substitutable.md`.

## Out of Scope

Explicitly deferred to future issues / PRs:
- Auto-classification of memory entries as scope-tier vs other (description-field keyword scan is sufficient for V1)
- Generic memory-relevance classifier (issue #332 body explicitly out-of-scope)
- Memory entry renames or restructuring
- Cross-rule memory propagation patterns
- Updating existing memory entries to add canonical scope-tier keywords to their `description:` fields (optional follow-up after merge; not blocking)
- Renaming `feedback_right_size_ceremony.md` itself
