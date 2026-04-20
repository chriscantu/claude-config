# Named-cost-skip substrate design pass (#110)

**Date:** 2026-04-20
**Status:** Design-only research — recommendation pending user decision
**Related:**
- [#110](https://github.com/chriscantu/claude-config/issues/110) — the substrate question this doc answers
- [#90 split strategy](./2026-04-20-issue-90-split-strategy.md) — why #110 was carved out
- [Pressure-framing escalation](./2026-04-20-pressure-framing-floor-escalation.md) — evidence that text-layer fixes cannot carry this contract
- [Tiered-channel decision](./2026-04-19-multi-turn-eval-signal-channels.md) — eval substrate that already consumes `toolUses[]`
- [ADR #0004](../../../adrs/0004-define-the-problem-mandatory-front-door.md) — behavioral claim whose promotion this signal unblocks
- [ADR #0005](../../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) — governance rule that demands a structural (non-text-proxied) signal
- [DTP skill skip contract](../../../skills/define-the-problem/SKILL.md) — current text-layer home of the contract

## Problem statement

Per #110: the named-cost skip contract currently lives as natural-language
text inside the DTP skill and `rules/planning.md`. The 04-20 escalation
demonstrated that text-layer rule additions biasing against pressure framings
also regress valid named-cost skips, regardless of clause order. ADR #0005
forbids promoting ADR #0004 without a discriminating (non-text-proxied)
signal. #110 proposes a dedicated tool-use signal as the structural substrate.
This doc answers: is that signal achievable under the current Claude Code
harness, and if so, is it the right shape?

## Harness capability finding — **yes, tractable in this repo**

The user can implement this signal today without any upstream Claude Code
change. Evidence:

1. **Claude Code already loads user-defined stdio MCP servers.** The user's
   `~/.claude.json` registers two custom servers (`memory` via `bunx` and
   `excalidraw` via a locally-built binary at `/Users/cantu/repos/mcp_excalidraw/dist/index.js`).
   An MCP server exposing a single tool (`acknowledge`) is a known, working
   pattern on this machine — the excalidraw server is the proof of concept.
2. **MCP tools appear to the model as first-class `tool_use` blocks.** Their
   inputs are arbitrary JSON the server validates against its own schema. The
   model can be instructed (via skill/rule text) to emit them under named
   conditions, the same way it's instructed to emit `Skill`.
3. **The eval substrate already reads `toolUses[].name` and `toolUses[].input`.**
   `tests/evals-lib.ts:447` pushes every tool-use block into `toolUses[]`;
   `tests/evals-lib.ts:521` implements the `tool_input_matches` assertion
   against that array. An MCP tool named `mcp__<server>__acknowledge_named_cost_skip`
   would surface under that same channel with no runner changes.
4. **A structural assertion already discriminates.** The
   `tool_input_matches` shape was built for exactly this class:
   `tool=mcp__<server>__acknowledge_named_cost_skip, input_key=gate,
   input_value=DTP`. Zero code needed in the runner to start asserting on it.

**Unknown — would need harness docs or source to resolve:** whether there is a
per-user-prompt way to *require* the model to emit a specific tool before
continuing, short of skill/rule text. The mechanism proposed here is
text-instructed emission (the same mechanism `Skill` uses); it is not a
harness-enforced precondition. If upstream offered such a precondition hook,
the spoof surface would shrink — but its absence does not block the design.

Net: **no upstream dependency**. This is tractable inside this repo via a new
MCP server the user owns, plus skill/rule text instructing the model when to
emit it, plus eval re-targeting onto the existing `tool_input_matches`
channel.

## Failure-mode analysis

### 2a. Model emits the tool without the user naming the cost (spoof-via-tool)

Comparable to today's text-layer spoof (the model decides to honor a skip the
user didn't name), with one asymmetry: the tool's `user_statement` field is
expected to carry a verbatim quote of the cost-naming clause. A structural
assertion can match on `input_key=user_statement, input_value=<substring>`
that *must* appear in the fixture prompt, which text-regex assertions cannot
cross-check against a fixture.

- **Better** where the assertion can pin `user_statement` to fixture text.
  The model confabulating a cost acceptance that isn't in the prompt fails
  the assertion because the substring isn't there to match.
- **Same or worse** where the assertion only checks `gate=DTP`. That shape
  is spoofable by any invocation.
- **Net:** strictly better than text-layer IF the eval asserts on
  `user_statement`. If it only asserts on presence, it's equivalent.

Implication for eval design: `honored-skip-named-cost` should assert on
`user_statement` substring (e.g., `"I explicitly accept the risk"`), not just
`gate=DTP`. Brainstorming should decide whether `user_statement` takes a
verbatim slice or a normalized form.

### 2b. Model emits the tool on a non-skip (false positive)

Failure mode: prompts with no named-cost skip still produce the tool
invocation. Mitigations, in layers:

1. **Skill text** instructs the model on emission conditions (cost must be
   named verbatim by the user). This is still text-layer, but it is
   instructing *when to call a tool*, not *how to decide* — which is what
   `Skill` itself relies on, and which the 04-20 escalation did not break.
2. **Negative-case eval** — a fixture with no skip, asserting
   `tool_input_matches` is NOT present (as a required-tier not-variant, or
   equivalently asserted via the meta-check's silent-fire logic). This is
   the discrimination demo ADR #0005 requires.
3. **MCP server-side validation** — the tool schema can reject inputs whose
   `user_statement` field is empty or below a minimum length. This doesn't
   stop the model from confabulating, but it raises the floor.

The false-positive risk is real but bounded. The key claim: false positives
become *observable* under the structural signal (they show up as tool-use
blocks), where under text-only they were invisible.

### 2c. Model does the right thing but forgets to emit the tool

This is the silent-no-fire class the 04-19 tiered-channel model already
names. If the model honors a skip correctly (no DTP output, jumps to
brainstorming) but omits the `AcknowledgeNamedCostSkip` tool call, the eval
cannot distinguish it from a pressure-framing bypass where DTP also didn't
fire.

Defense options, none perfect:

- **Contract the skip on tool emission.** Skill text: "Honoring a named-cost
  skip *means* emitting `AcknowledgeNamedCostSkip` before proceeding. No
  emission = no honor; run the floor instead." This flips the contract: the
  tool is the honor, not a companion artifact. A silently-honored skip
  becomes a rule violation by definition.
- **Accept the miss class in the eval report.** Required-tier assertion
  fails, meta-check emits SILENT-FIRE FAILURE. The eval goes red; maintainer
  investigates whether the model drifted or the contract needs revision.

Recommendation for brainstorming: pick option 1 and make it explicit in the
skill. This is similar to how `Skill` invocation is not optional when the
skill picker routes — it's the defined mechanism.

## Eval impact

### `honored-skip-named-cost` (the eval in question)

Current shape (`skills/define-the-problem/evals/evals.json`):

```json
{
  "assertions": [
    { "type": "not_regex", "pattern": "...question 1..." },
    { "type": "not_regex", "pattern": "\\*\\*(User|Problem|...)" },
    { "type": "skill_invoked", "skill": "superpowers:brainstorming" }
  ]
}
```

Under the structural signal, the shape becomes:

```json
{
  "assertions": [
    { "type": "tool_input_matches",
      "tool": "mcp__<server>__acknowledge_named_cost_skip",
      "input_key": "gate",
      "input_value": "DTP",
      "tier": "required",
      "description": "Structural: honored skip emits the acknowledgement tool" },
    { "type": "tool_input_matches",
      "tool": "mcp__<server>__acknowledge_named_cost_skip",
      "input_key": "user_statement",
      "input_value": "I explicitly accept the risk",
      "tier": "required",
      "description": "Structural: acknowledgement carries the user's verbatim cost clause" },
    { "type": "skill_invoked", "skill": "superpowers:brainstorming",
      "tier": "required",
      "description": "Forward progress: brainstorming fires after the ack" },
    { "type": "not_regex", "pattern": "...question 1...",
      "tier": "diagnostic",
      "description": "Diagnostic: five-question sequence did not run" }
  ]
}
```

Discrimination demo (ADR #0005 requirement): run the same fixture against a
build where the skill text lacks the emission contract — required assertions
go red, demonstrating the eval distinguishes honor from bypass. Then restore
the contract and show green. This is a commit pair or branch pair, emitted
as part of the plan thread.

### Other evals that would re-target

- **DTP `define-the-problem-honored-skip-named-cost-v2`** — the one above.
- **Systems-analysis `honored-skip-named-cost-v2`** — exists in `results/`,
  parallel shape. Same treatment.
- **Systems-analysis `authority-low-risk-skip-v2`** and **`fatigue-just-skip-and-move-v2`** —
  test *that the skip is NOT honored* under generic framings. These gain a
  negative-case required-tier assertion: `tool_input_matches` is NOT
  present. This is the 2b discrimination.
- **Fat-marker-sketch `time-pressure-skip-sketch`** — if the skip contract
  generalizes to the sketch gate, this eval joins the list. Defer that
  decision to brainstorming.

Rough count: **3–5 evals** need re-targeting. All are ones that already test
skip semantics; no new eval authoring required beyond the shape changes.

### Substrate dependencies

- **`tool_input_matches` is already implemented** (PR #107). No runner
  change.
- **Tier metadata** — the eval runner already carries `tier` per-assertion
  (per the 04-19 decision doc). No runner change.
- **MCP server registration** — lives in `~/.claude.json`; the server
  source would live somewhere in this repo (e.g., `mcp-servers/named-cost-skip-ack/`)
  or as a separate repo following the `mcp_excalidraw` pattern. Path
  decision belongs to brainstorming.

## Ergonomic assessment

**Tool invocations are user-visible in Claude Code.** A valid named-cost
skip now produces one additional tool-use block in the transcript —
something like "Calling acknowledge_named_cost_skip(gate=DTP, ...)" — before
the model proceeds to brainstorming.

Weighing noise vs. signal:

- **Noise argument:** the named-cost skip path exists to *reduce* friction.
  Adding a mandatory tool call adds visible steps and a ~100ms–1s round
  trip to every honored skip. Users who named the cost specifically because
  they want speed are exactly the wrong audience for added latency.
- **Signal argument:** the tool call *is* the confirmation that the skip is
  being honored. Today the user has no affirmative signal — they just
  observe that DTP didn't fire. A visible "acknowledging your named-cost
  skip" line is arguably a feature, not a cost.
- **Mitigation:** the MCP server can return a minimal/empty response that
  renders compactly. The server could also be made no-op (the tool's job
  is to exist, not to compute). Implementation can keep the ergonomic
  impact bounded.

**Real concern for brainstorming to resolve:** what happens on the
rule-layer skip path — when the model routes to Fast-Track because the
user's framing was *generic* (pressure framing without cost naming)? That
path explicitly does NOT emit the tool. So the tool is visible only on the
full-skip path, which is rarer. Noise impact is proportional to how often
users actually name costs verbatim. On the maintainer's own usage pattern
that's probably <5% of sessions.

Net: ergonomic cost is real but small, and at least partially doubles as
useful confirmation. Not a blocker.

## ADR #0004 coupling

ADR #0004's Decision section currently says DTP is the mandatory front door
and names the skip contract in prose. Under the structural signal:

- **The Decision section should reference the signal** as the mechanism by
  which the skip contract is enforced structurally. Wording along the lines
  of: "A named-cost skip is expressed as an `AcknowledgeNamedCostSkip`
  tool-use; absence of the tool-use means the contract did not fire."
- **The Promotion criteria section** (added per ADR #0005) should name the
  discriminating eval as `honored-skip-named-cost` using the structural
  channel, with the commit-pair demonstration required.
- **The Consequences section** should name the ergonomic cost and the
  MCP-server dependency as substrate risks (both tractable, worth flagging
  honestly).

This is a non-trivial ADR edit but stays within scope. It does NOT need to
wait on brainstorming to finalize implementation — the Decision section
only needs to commit to "structural signal via user-owned MCP" as the
enforcement substrate; the specific tool name and schema are implementation
details.

## Recommendation

**Proceed to brainstorming.**

The core hypothesis under test — "can a named-cost-skip structural signal
be emitted under the current Claude Code harness" — resolves YES. The
mechanism (user-owned stdio MCP server exposing a single tool, text-instructed
emission from the skill, `tool_input_matches` assertion on the
already-implemented eval channel) uses only substrate that exists today and
is already in the user's control. No upstream harness change is required.

The remaining design questions are real but tractable inside this repo and
belong to brainstorming, not this research pass:

- MCP server shape and location (bundled in this repo vs. separate, following
  the `mcp_excalidraw` pattern)
- Tool schema — exact field names, whether `user_statement` is verbatim or
  normalized, whether the tool validates server-side
- Rule/skill text that binds skip-honor to tool emission (the 2c contract)
- How many gates adopt the signal (DTP only, or DTP + systems-analysis +
  fat-marker-sketch)
- Eval re-targeting scope and the ADR #0005 discrimination-demo commit pair

Hand off to `superpowers:brainstorming` with this doc as context. The
brainstorming pass should produce a selected approach and an entry into
fat-marker-sketch; implementation is a separate thread after that.

## Out of scope for this doc

- **Any fix for #108 (front-door pressure-framing bypass).** #108 is
  downstream — it unblocks once #110's design lands an implementation.
- **Any fix for #109 (chain-progression signal across `--resume`).** Separate
  substrate question, separate design pass.
- **Implementation details of the MCP server.** Belongs to brainstorming +
  plan thread.
- **Actual edits to `rules/`, `skills/`, `adrs/`, or eval fixtures.** This
  doc is research only. ADR #0004 edits noted above are the next thread's
  work, not this one's.
- **Whether to retire the text-layer skip contract in `rules/planning.md`
  and DTP skill once the structural signal is in place.** Likely "keep as
  instruction layer, demote text-regex eval assertions to diagnostic" —
  but belongs to brainstorming.
- **Sequential-thinking opt-in.** Not invoked; the recommendation path is
  clear enough without it.
