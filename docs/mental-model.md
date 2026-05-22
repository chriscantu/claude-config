# Mental Model

The conceptual model behind `claude-config`. Read this once before touching rules, skills, or evals — it names the eight load-bearing concepts the rest of the repo assumes you've internalized.

The model is the moat. Anti-sycophancy is the hook; the pipeline + skip discipline + discriminating-signal evals are what make the hook stick. If you change a rule without understanding which concept it owns, you will silently weaken the gate it belongs to.

Audience: a new contributor (external, no prior context) who needs to land a non-trivial PR. After reading, you should be able to read any rule file and predict which concept it implements.

## 1. The pipeline

Out of the box, Claude jumps to implementation. It picks an approach without surfacing trade-offs, codes without verifying, and agrees with you when you push back. The pipeline is the structural counter:

```
DTP → Systems Analysis → Brainstorming → Fat Marker Sketch → Detailed Design → TDD → Verification
```

Each stage owns one discriminating signal. DTP surfaces the *problem* (named user, current behavior, stakes). Systems Analysis surfaces the *blast radius*. Brainstorming surfaces *trade-offs* (2-3 approaches, recommendation with reasoning). Fat Marker Sketch surfaces *shape* (visual structure before pixel detail). TDD writes a failing test first. Verification runs tests, type-check, and goal-direction sanity check before claiming done.

The stages are HARD-GATEs — Claude cannot proceed past one without producing its artifact (problem statement, surface scan, trade-off matrix, sketch, verify output). Stage transitions are announced visibly so the user can audit the path.

Canonical source: [`rules/planning-pipeline.md`](../rules/planning-pipeline.md).

## 2. Skip contracts

Sometimes a stage is overhead — a typo fix doesn't need DTP. The skip contract names what counts as a valid skip and what doesn't.

Valid skip: the user **names the specific cost** being accepted. *"Skip DTP, I accept the risk of building on an unstated problem."* The clause cites the gate AND the risk. Generic acknowledgements — "trust me," "I accept the trade-off," "ship it," "you know what I want" — do NOT qualify. They run the gate.

Time pressure is not an override. *"Quick fix," "demo in 10 minutes," "ship by Friday"* make the gate more important, not less. A rushed unverified output is the most expensive thing to land.

Generic skip framings fall through to the pressure-framing floor (see §3), which routes them back to the pipeline with an example of valid skip phrasing. The user can exit cleanly if they genuinely want to bypass — they just have to name the cost.

Canonical source: [`rules/skip-contract.md`](../rules/skip-contract.md).

## 3. Pressure framing

When a skip framing is generic, the floor classifies it into one of five categories and routes accordingly:

- **Authority** — "CTO approved," "legal signed off," "the board voted"
- **Sunk cost** — "already committed," "decision is made," "we've already chosen"
- **Exhaustion** — "I'm tired," "just give me code," "stop asking questions"
- **Deadline** — "ship by Friday," "meeting in 10 minutes"
- **Stated-next-step** — "skip DTP and brainstorm X," "bypass the pipeline"

Categories are semantic — match the underlying mechanism, not the literal wording. Each strengthens the case for Expert Fast-Track (condensed DTP) rather than full skip. None alone is a named-cost skip.

The floor is non-bypassable except via the `DISABLE_PRESSURE_FLOOR` sentinel file — an intentionally visible emergency rollback (banner emitted on first pressure-framed prompt of the session). The floor's architectural invariant: enforcement lives in the rules layer, NOT in DTP itself, because a skill cannot catch its own failure-to-load.

Canonical source: [`rules/pressure-framing-floor.md`](../rules/pressure-framing-floor.md).

## 4. Emission contract

Naming the cost is necessary but not sufficient. When a named-cost skip is valid, the agent MUST invoke the `acknowledge_named_cost_skip` MCP tool, passing the gate name and the verbatim user clause, BEFORE proceeding past the gate. The tool-use IS the honor.

Why a tool call and not a text token? Text tokens drift — they get rephrased, summarized, abbreviated. A tool invocation is a structural artifact: it appears in the transcript exactly once, with exact parameters, auditable by the substrate without LLM judgment. The substrate enforces the contract; the LLM can't talk its way around it.

Per-gate values live in the [emission-contract table](../rules/skip-contract.md#emission-contract-per-gate): `DTP`, `goal-driven`, `fat-marker-sketch`, `pr-validation`, `think-before-coding`. In autonomous loops, the gate has four exits: pass, mechanical carve-out, sentinel bypass, or hard-block-and-surface. Silent skip is structurally impossible.

Canonical source: [`rules/skip-contract.md#emission-contract`](../rules/skip-contract.md#emission-contract).

## 5. Discriminating signals (ADR #0005)

A rule earns HARD-GATE status only by producing a behavioral signal that's RED (failure observable) when the rule is absent AND GREEN (success observable) when the rule is present — measured at the rule's own boundary, not "somewhere in the rules layer."

Why this matters: without a discriminating signal, adding a rule is theater. Two rules with overlapping concerns can both pass when only one is loaded — the eval can't tell them apart. The fix is named coverage: each rule's eval suite must include at least one assertion that fails when this specific rule is removed but every other rule is present.

The same discipline now applies at the skill layer ([ADR #0019](../adrs/0019-skill-eval-discriminating-signal-discipline.md), enforced by validate Phase 1r) — every `skills/<name>/evals/evals.json` needs at least one `"tier": "required"` assertion.

Canonical sources: [ADR #0005](../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md), [ADR #0019](../adrs/0019-skill-eval-discriminating-signal-discipline.md).

## 6. Anchor pattern

Rules deep-link each other (e.g., `pr-validation.md` cites `skip-contract.md#emission-contract`). GitHub's auto-generated heading IDs are fragile: rename a section from "## Emission contract — MANDATORY" to "## Emission contract" and every existing deep-link silently 404s. Anchor text drift is the failure mode.

The fix: explicit `<a id="emission-contract"></a>` HTML anchors above sections that other rules cite. The id is stable across heading rewrites. Three validate phases enforce the contract:

- **Phase 1j** — fails if the floor-trio files lose a registered anchor
- **Phase 1k** — fails when a cross-rule anchor link targets an undefined id
- **Phase 1l** — fails if a rule registered as delegating to a floor anchor loses the delegate link

Together: anchors must exist, links must resolve, and the delegation graph stays intact. A reviewer who renames a section silently is caught by Phase 1j; one who deletes a delegate paragraph entirely is caught by Phase 1l.

Canonical source: [`rules/GOVERNANCE.md#stable-anchor-pattern`](../rules/GOVERNANCE.md).

## 7. HARD-GATE cap (8 rules)

The repo caps HARD-GATE rules at 8. Adding a 9th requires satisfying a three-condition gate:

1. **Extension-first audit** — can the concern be expressed by extending an existing rule? If yes, extend.
2. **Discriminating signal per ADR #0005** — RED/GREEN at the new rule's specific boundary, not borrowed from an adjacent gate.
3. **Substrate cost accounting** — every rule adds context-load and inference latency to every session. Quantify the cost.

Why a cap? Rules compound. Each one runs on every prompt; the cumulative context becomes the bottleneck before any specific rule fires. Worse, behavioral concerns tend to overlap — a 9th rule often duplicates discrimination an existing gate already owns, so the new rule eats budget without adding signal.

The current 8: planning-pipeline, think-before-coding, fat-marker-sketch, goal-driven, verification, pr-validation, disagreement, memory-discipline, execution-mode. (Plus `tdd-pragmatic` as soft guidance — not a HARD-GATE.)

Canonical source: [`rules/GOVERNANCE.md#hard-gate-cap`](../rules/GOVERNANCE.md#hard-gate-cap).

## 8. Scope-tier routing

Not every prompt needs the full pipeline. A scope-tier hook (`hooks/scope-tier-memory-check.sh`) fires before the pressure-framing floor on every `UserPromptSubmit`. When it matches a stored `feedback` memory (e.g., "trivial mechanical changes skip DTP/SA/brainstorm/FMS"), it injects a `SCOPE-TIER MATCH:` system-reminder. The agent acknowledges in one visible line and routes directly to single-implementer implementation.

Compose order: scope-tier hook (Layer 1, structural) fires first. If no match, pressure-framing floor (Layer 2, rule text) evaluates. If neither fires, full pipeline. Both layers share the `DISABLE_PRESSURE_FLOOR` sentinel — a single off-switch for emergency rollback.

The hook is graceful degradation: if not installed, Layer 2 alone still works as a soft check, but the structural guarantee comes from Layer 1. Install via `fish bin/install-scope-tier-hook.fish`.

Trivial-tier carve-out (four criteria: ≤200 LOC, single component, unambiguous approach, low blast radius) is the fallback for prompts WITHOUT a hook match but WITH all four criteria satisfiable. Both routes converge on the same destination: skip DTP/SA/brainstorm/FMS, keep goal-driven verify checks + verification end-gate.

Canonical source: [`rules/pressure-framing-floor.md#scope-tier-memory-check`](../rules/pressure-framing-floor.md#scope-tier-memory-check).

---

## Where to go next

- [`docs/catalog.md`](catalog.md) — full inventory of rules, skills, agents, templates
- [`docs/contributing.md`](contributing.md) — how to add a rule, skill, or agent
- [`docs/operations.md`](operations.md) — runtime bypass flags, hook setup, validate phases
- [`rules/GOVERNANCE.md`](../rules/GOVERNANCE.md) — full HARD-GATE cap policy, anchor pattern, retirement procedure
- [`adrs/`](../adrs/) — every concept above traces to one or more ADRs

The pipeline is what you see. The skip + pressure + emission triad is what makes it non-bypassable. Discriminating signals + anchor pattern + HARD-GATE cap are what keep it from rotting. Scope-tier routing is what keeps it from being theater on trivial work.
