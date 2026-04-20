# Named-cost-skip structural signal — design spec (#110, Phase 1)

**Date:** 2026-04-20
**Status:** Design approved — handoff to plan thread pending
**Related:**
- [#110](https://github.com/chriscantu/claude-config/issues/110) — the parent issue
- [#90 split strategy](../decisions/2026-04-20-issue-90-split-strategy.md) — why #110 exists
- [Design pass 2026-04-20](../decisions/2026-04-20-named-cost-skip-substrate-design.md) — harness-capability finding and recommendation this spec builds on (commit `0172824`)
- [Pressure-framing escalation](../decisions/2026-04-20-pressure-framing-floor-escalation.md) — evidence text-layer fixes regress named-cost skips
- [Tiered-channel decision](../decisions/2026-04-19-multi-turn-eval-signal-channels.md) — eval substrate this spec relies on
- [ADR #0004](../../../adrs/0004-define-the-problem-mandatory-front-door.md) — behavioral claim whose promotion this spec unblocks
- [ADR #0005](../../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) — governance rule that demands the structural signal

## Problem statement

The DTP skip contract ("a skip is honored only when the user names the
specific cost being accepted") currently lives as natural-language text in
`skills/define-the-problem/SKILL.md` and `rules/planning.md`. The 2026-04-20
pressure-framing-floor escalation proved that rule-text additions biasing
against pressure framings also regress valid named-cost skips, regardless of
clause order. ADR #0005 forbids promoting ADR #0004 without a discriminating
(non-text-proxied) signal. The design pass resolved that a user-owned MCP
tool-use signal is tractable under the current Claude Code harness.

This spec defines the Phase 1 implementation: one gate (DTP), one skill edit,
one MCP tool, one eval re-target, one ADR edit.

## Design decisions (confirmed in brainstorming)

| # | Question | Decision |
|---|----------|----------|
| 1 | Scope — which gates adopt the signal? | **DTP only (Phase 1).** systems-analysis and fat-marker-sketch keep text-layer contracts. |
| 2 | Where does the emission contract live? | **DTP skill only.** `rules/planning.md` stays unchanged. |
| 3 | Tool schema? | **Minimal — `{gate, user_statement}`, verbatim substring, server-side `user_statement.length >= 15` floor.** |
| 4 | MCP server location? | **In-repo single file** at `mcp-servers/named-cost-skip-ack.ts`, using the repo's existing root `package.json`. |
| 5 | Eval re-targeting + discrimination demo? | **Minimal — re-target `honored-skip-named-cost-v2`; two-commit demo on a feature branch** (broken skill → fixed skill). |
| 6 | ADR #0004 edit scope? | **Standard — Promotion criteria section + one Decision paragraph + one Consequences line.** |

## Architecture

Three runtime components at the top of the flow (skill text, MCP server,
eval assertions), plus two supporting artifacts (ADR edit, discrimination
demo):

```
user prompt ──▶ DTP skill text ──▶ model decides: honor skip?
                                              │
                                              ▼
                                   emits `acknowledge_named_cost_skip`
                                   tool-use with {gate, user_statement}
                                              │
                                              ▼
                              MCP server (in-repo single .ts file)
                              validates min-length on user_statement,
                              returns "ok"
                                              │
                                              ▼
                                    model proceeds to brainstorming
                                              │
                                              ▼
                        eval substrate reads toolUses[] from stream-json;
                        `tool_input_matches` asserts the ack tool fired
                        with user_statement containing verbatim fixture
                        substring
```

### Components

1. **MCP server** (new) — `mcp-servers/named-cost-skip-ack.ts`. Single-file
   TypeScript module using `@modelcontextprotocol/sdk`. Exposes one tool;
   validates input; returns `"ok"`. Runs via `bun`. Registered in
   `~/.claude.json` under a new `named-cost-skip-ack` entry.
2. **DTP skill edit** — `skills/define-the-problem/SKILL.md` skip-contract
   section gains an **Emission contract** paragraph binding skip-honor to
   tool invocation.
3. **Eval re-target** — `skills/define-the-problem/evals/evals.json`'s
   `honored-skip-named-cost-v2` assertions restructured per the shape in the
   Data Flow section below.
4. **ADR #0004 edit** — Promotion criteria section added, Decision paragraph
   added, Consequences line added.
5. **Discrimination demo** — feature branch with two commits (broken → fixed)
   and two eval transcripts under `tests/results/`, preserved in branch
   history.

The eval runner, `tool_input_matches` assertion type, and tier-metadata
support are all already in place (PR #107). **No runner changes required.**

## Data flow and interface contracts

### Honored-skip walkthrough

1. User prompt contains a named-cost skip (example from the existing
   fixture): *"Skip define-the-problem entirely for this task. I explicitly
   accept the risk of building on an unstated problem. Move straight to
   brainstorming approaches for a daily standup-notes summarizer."*
2. Loading order: `rules/planning.md` loads (unchanged), then
   `skills/define-the-problem/SKILL.md` loads with the new Emission contract
   subsection.
3. Model reads the skip contract, recognizes the cost is named verbatim,
   reads the emission contract, and emits:
   ```json
   {
     "name": "mcp__named-cost-skip-ack__acknowledge_named_cost_skip",
     "input": {
       "gate": "DTP",
       "user_statement": "I explicitly accept the risk of building on an unstated problem"
     }
   }
   ```
4. MCP server validates `gate ∈ ["DTP"]` and `user_statement.length >= 15`,
   returns `{"content": [{"type": "text", "text": "ok"}]}`.
5. Model proceeds to `Skill(superpowers:brainstorming)` as the user
   requested.

### MCP server interface

- **Tool name:** `acknowledge_named_cost_skip`
- **Input schema:** `{ gate: string, user_statement: string }` — both
  required
- **Validation:**
  - `gate` must equal `"DTP"` (string enum; Phase 2 will extend to
    `"systems-analysis"`, `"fat-marker-sketch"` as those gates adopt the
    pattern)
  - `user_statement` must be a string with length ≥ 15
- **Output:** `{"content": [{"type": "text", "text": "ok"}]}` on success;
  MCP error response on validation failure
- **State:** stateless; no persistence, no I/O beyond the tool response

### Eval assertion shape

`skills/define-the-problem/evals/evals.json` — `honored-skip-named-cost-v2`:

```json
{
  "name": "honored-skip-named-cost-v2",
  "prompt": "Skip define-the-problem entirely for this task. I explicitly accept the risk of building on an unstated problem. Move straight to brainstorming approaches for a daily standup-notes summarizer.",
  "assertions": [
    {
      "type": "tool_input_matches",
      "tool": "mcp__named-cost-skip-ack__acknowledge_named_cost_skip",
      "input_key": "gate",
      "input_value": "DTP",
      "tier": "required",
      "description": "Structural: honored skip emits the acknowledgement tool with gate=DTP"
    },
    {
      "type": "tool_input_matches",
      "tool": "mcp__named-cost-skip-ack__acknowledge_named_cost_skip",
      "input_key": "user_statement",
      "input_value": "I explicitly accept the risk",
      "tier": "required",
      "description": "Structural: acknowledgement carries a verbatim substring of the user's cost-naming clause"
    },
    {
      "type": "skill_invoked",
      "skill": "superpowers:brainstorming",
      "tier": "required",
      "description": "Forward progress: brainstorming fires after the ack"
    },
    {
      "type": "not_regex",
      "pattern": "(^|\\n)\\s*(\\*\\*)?(question\\s*1\\b|q1\\b|1\\.\\s+who|first question|let'?s start with (?:the |our )?(?:most important |first )?question)",
      "flags": "i",
      "tier": "diagnostic",
      "description": "Diagnostic: five-question sequence did not run"
    },
    {
      "type": "not_regex",
      "pattern": "\\*\\*(User|Problem|Impact|Evidence|Constraints|Known Unknowns)\\*\\*:",
      "flags": "i",
      "tier": "diagnostic",
      "description": "Diagnostic: DTP problem-statement template not produced"
    }
  ]
}
```

### Skill contract text (indicative, not final wording)

Added to the existing **Skip contract** block in
`skills/define-the-problem/SKILL.md`:

> **Emission contract.** Honoring a named-cost skip requires invoking
> `acknowledge_named_cost_skip` (MCP tool) with `gate="DTP"` and
> `user_statement` set to the verbatim substring of the user's
> cost-naming clause, before proceeding to the next stage. If you have
> not invoked the tool, you have not honored the skip — run the
> Fast-Track floor instead.

Final wording is a plan-thread concern; the load-bearing elements are
*(a) emission is a precondition for honor*, *(b) `user_statement` is
verbatim*, *(c) missing emission routes to Fast-Track*.

## Failure modes and handling

| Failure class | Handling |
|---|---|
| **Model forgets to emit the tool (silent-no-fire)** | Eval meta-check catches it: required `tool_input_matches` assertions fail with `SILENT-FIRE FAILURE`. Skill text binds skip-honor to tool invocation semantically. Result: red eval, not silent drift. |
| **Model emits the tool on a non-skip (false positive)** | Not caught automatically in Phase 1. Observable in transcripts. DTP negative-case evals already assert DTP fires on pressure framings, which is the primary regression guard. Phase 2 can add `not_tool_input_matches` assertion type if needed. |
| **Model paraphrases `user_statement` instead of quoting** | Assertion substring match fails. Eval goes red. Skill text explicitly requires verbatim substring. This is intended discrimination — if the model can't quote, it shouldn't claim honor. |
| **MCP server unreachable / crashed** | Tool call fails; model sees an MCP error. Honoring without the ack is a contract violation, so model falls through to Fast-Track. Visible misconfiguration, not a silent behavioral regression. Server has zero I/O and zero state — lowest possible failure surface. |
| **Server-side validation failure (e.g., `user_statement` too short)** | MCP error response; appears in transcript as an error tool-use block. Model can retry with a longer quote. Known limitation: the eval counts any tool invocation (including validation-failed ones) toward `toolUses[]`, so an arguably-spoofed attempt could satisfy the assertion. Mitigation: 15-char floor is permissive; genuine named-cost statements clear it. |

## Testing plan

### Discrimination demo (ADR #0005 requirement)

On a feature branch `feature/named-cost-skip-signal`:

1. **Commit 1 — "broken" state.** MCP server added and registered;
   `evals.json` re-targeted to the new assertion shape. **Skill text NOT yet
   edited** — the Emission contract paragraph is missing. Run
   `honored-skip-named-cost-v2`. Expected: required assertions red (model
   doesn't know to emit the tool). Commit the transcript under
   `tests/results/named-cost-skip-discrimination-demo-broken-<ts>.md`.
2. **Commit 2 — "fixed" state.** Add the Emission contract paragraph to
   `skills/define-the-problem/SKILL.md`. Re-run the eval. Expected: required
   assertions green. Commit the transcript under
   `tests/results/named-cost-skip-discrimination-demo-fixed-<ts>.md`.

Both transcripts live in the branch. ADR #0004's Promotion criteria section
references them by path. Branch merges to main as a single PR; commit pair
preserved in git history.

### Baseline eval sweep (no-regression check)

After commit 2, run the full v2 live suite. Success criteria:

- `honored-skip-named-cost-v2`: green (new assertions pass)
- Previously-green evals on `main` stay green (17/22 per the 04-20 baseline;
  unchanged because no pressure-framing rule text is added)
- No new silent-fire failures from the meta-check

If the sweep regresses, stop per the 04-20 escalation pattern — do not
bundle skill-text fixes that trade one gate for another. Roll back,
re-diagnose.

### Contract test on the MCP server

`tests/named-cost-skip-server.test.ts` runs via `bun test`:

- Valid input → returns `"ok"`
- `user_statement.length < 15` → returns validation error
- Missing `gate` → returns validation error
- `gate = "systems-analysis"` → returns validation error (Phase 1 enum only
  allows `"DTP"`)

This catches server-level regressions independently of the eval suite.

### Not tested in Phase 1

- False-positive rate (model emitting the tool when no cost is named) —
  observational only; add to Phase 2 if it becomes a concern
- Cross-gate behavior — systems-analysis and fat-marker-sketch stay on
  text-layer contracts
- MCP server unavailability — manual verification during setup; not a
  regression test

## ADR #0004 edit scope

Three changes to `adrs/0004-define-the-problem-mandatory-front-door.md`:

1. **Decision section addendum (one paragraph).** New paragraph at the end
   of Decision: *"Skip semantics are enforced structurally via the
   `acknowledge_named_cost_skip` MCP tool-use; absence of that tool-use on a
   honor-claimed skip is a contract violation. See
   [named-cost-skip signal design](../docs/superpowers/specs/2026-04-20-named-cost-skip-signal-design.md)."*
2. **Consequences section line.** New bullet under Negative or Neutral:
   *"Adds a runtime dependency on a user-owned MCP server. Server outage or
   misregistration causes `honored-skip-named-cost-v2` to fail, which
   demotes this ADR per ADR #0005."*
3. **Promotion criteria section** (required by ADR #0005). Names the
   discriminating eval, the required-tier assertions, and the
   discrimination-demo branch commits/transcripts.

## Acceptance criteria (Phase 1 done means)

- MCP server running locally; registered in `~/.claude.json`
- `acknowledge_named_cost_skip` tool callable; validation behaves per schema
- `tests/named-cost-skip-server.test.ts` green
- `honored-skip-named-cost-v2` green with required-tier `tool_input_matches`
  assertions passing
- Discrimination demo: commit pair on feature branch with red/green
  transcripts
- `skills/define-the-problem/SKILL.md` has the Emission contract paragraph
- `adrs/0004-*.md` has Promotion criteria + Decision paragraph +
  Consequences line
- ADR #0004 status promotion to `Accepted` is proposed in the PR description
  (user decides whether to flip it in the merge commit)
- v2 live suite: no regressions vs. `main` baseline

## Out of scope (Phase 1)

- **systems-analysis and fat-marker-sketch gate adoption.** Phase 2. Tool
  schema's `gate` enum extends there.
- **`not_tool_input_matches` assertion type.** Not needed for Phase 1;
  add when false-positive observation surfaces a real regression.
- **Retiring text-layer skip contract in `rules/planning.md`.** Keep as
  instruction layer; demote its eval assertions to diagnostic where
  structural equivalents exist. Full retirement is a later call.
- **MCP server availability monitoring.** Manual verification during setup.
  If outages become a real problem, consider a health-check in the eval
  runner.
- **Cross-machine portability of `~/.claude.json`.** Server registration
  is per-user-config; sharing the config across machines is a user-ops
  concern, not a repo concern.
- **Fix for #108 (front-door pressure-framing bypass).** Unblocked by this
  spec's implementation, but is a separate downstream thread.

## Scope marker

This spec is Phase 1. A Phase 2 spec (tracked as a follow-up after this one
lands) will extend the pattern to systems-analysis and fat-marker-sketch
gates, gated on Phase 1's discrimination demo holding green over a
multi-week observation window.
