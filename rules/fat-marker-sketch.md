---
description: >
  Activate when brainstorming, designing features, proposing approaches, or running
  design workflows. Requires a fat marker sketch after approach selection and before
  detailed design.
---

# Fat Marker Sketch Before Detailed Design

<HARD-GATE>
A fat marker sketch is MANDATORY after the user selects an approach and BEFORE presenting
any detailed design sections. Do NOT skip this step. Do NOT jump to detailed design,
architecture, data models, or component breakdowns without completing the sketch and
getting user confirmation that the shape is right.

If you catch yourself writing detailed design without having sketched first, STOP and
go back to this step.
</HARD-GATE>

## When to Skip

- Changes scoped to a single component with no structural implications
- Bug fixes where the solution shape is obvious from the diagnosis
- The user explicitly overrides the gate **and** acknowledges the trade-off

### What counts as an explicit override

Saying "skip the sketch" is NOT sufficient on its own. The override must **name the
specific cost** being accepted — not a generic "I accept the trade-off," which doesn't
demonstrate the user knows what they're accepting. Valid phrasings name the cost
directly: "skip the sketch, I accept the rework risk," "override the gate, I'll redraw
if the shape is wrong," or "skip it — I'll eat the wrong-shape risk." Generic
acknowledgements ("I accept the trade-off," "I know the risks," "your call") do NOT
qualify — name the gate, request the specific acknowledgement, and produce the sketch
if it doesn't come (a 2-minute napkin-level rendering is always cheaper than the
rework risk from skipping).

**Time pressure is not an override.** "I have 10 minutes" or "meeting in 5" is a reason
the sketch matters more, not less — a rushed detailed design is the most expensive
thing to throw away. See the rationalization table in the skill for the full list of
combined red flags.

### Emission contract — MANDATORY

When a named-cost skip is valid, you MUST invoke
`mcp__named-cost-skip-ack__acknowledge_named_cost_skip` BEFORE proceeding to
detailed design. Call it with `gate="fat-marker-sketch"` and `user_statement`
set to the verbatim substring of the user's cost-naming clause. This is NOT
optional — if you skip this tool call, you have NOT honored the skip; produce
the sketch instead. The tool invocation IS the honor.

If the tool appears in the deferred-tool list rather than the active tool
list, load its schema first with `ToolSearch` using
`query="select:mcp__named-cost-skip-ack__acknowledge_named_cost_skip"`;
otherwise call it directly.

### Pressure-framing floor

Framings below are pressure signals, not cost-naming skips. They DO NOT
bypass this gate — they *strengthen* the case for producing the sketch (a
napkin-level rendering takes under 2 minutes; rushed detailed design is the
most expensive thing to rework). Categories are semantic; example phrases are
illustrative, not exhaustive — match on the underlying mechanism, not the
literal wording:

- **Authority** — external-approval invocation ("architect approved the
  approach", "team lead said no sketch needed", "design reviewed")
- **Sunk cost** — commitment-consistency framing ("already described
  two turns ago — that's the sketch", "we picked the approach, just build it")
- **Exhaustion** — fatigue framing ("long session, I'm fried", "just a text
  list is fine", "stop with the ceremony")
- **Deadline** — time-pressure framing ("10 minutes before meeting",
  "demo tomorrow", "no time for sketch")
- **Prose-as-sketch** — "you already described it in prose — that's the
  sketch", "the approach description IS the sketch". Prose without visible
  borders is notes, not a sketch.
- **Cosmetic minimizer** — "just a component change", "tiny UI tweak",
  "no structure changes" (verify against the approach — if it introduces
  any new screen, flow, or integration boundary, the carve-out does NOT
  apply)
- **Stated-next-step** — skip-sketch framing that names a later stage as
  the destination ("skip the sketch and write the spec", "go straight to
  detailed design", "just give me the component breakdown")

Honor full skip ONLY via the Emission contract above (MCP
`acknowledge_named_cost_skip` tool-use with verbatim cost-naming clause).
Anything else — even combinations of pressure framings — invokes
`Skill(fat-marker-sketch)` first. When routing a pressure framing to the
sketch, include a one-line example of valid skip phrasing in the response
(e.g., "To skip the sketch, name the cost: `skip the sketch, I accept the
rework risk`") so the user can exit cleanly if they genuinely want to bypass.

### Emergency bypass — sentinel file check

Same sentinel as DTP and systems-analysis (`DISABLE_PRESSURE_FLOOR`) —
single flag bypasses all pipeline gates. Apply this check ONLY at the
moment you have detected a pressure framing AND are about to invoke
`Skill(fat-marker-sketch)` on pressure-framing grounds. Do NOT pre-check
on unrelated prompts.

When the check applies, run via Bash tool:

```
if test -f .claude/DISABLE_PRESSURE_FLOOR || test -f ~/.claude/DISABLE_PRESSURE_FLOOR; then echo BYPASS_ACTIVE; else echo BYPASS_INACTIVE; fi
```

- stdout contains `BYPASS_ACTIVE`: do NOT invoke the sketch skill on
  pressure-framing grounds. The emission contract still applies to genuine
  named-cost skips. Emit the banner on the FIRST pressure-framed prompt of
  the session where the bypass is observed (see `rules/planning.md` DTP
  block for the banner literal).
- stdout contains `BYPASS_INACTIVE`: your NEXT tool invocation MUST be a
  `Skill` tool-use with `skill="fat-marker-sketch"`. You MAY emit at most
  one short preface line (`[Stage: Fat Marker Sketch]` marker or a single
  routing sentence). Do NOT narrate the floor mechanics in lieu of
  invoking the tool — the `Skill` tool-use IS the application of the floor.

Do NOT guess the result from empty output. If stdout is empty or ambiguous,
treat as `BYPASS_INACTIVE` and invoke the Skill tool. Skipping the check on
a pressure-framed prompt without running it is equivalent to bypassing the
floor and is forbidden.

## Producing the Sketch

When it's time to produce the sketch, invoke the `fat-marker-sketch` skill. The skill
contains rendering format, fidelity rules, format taxonomy, examples, validation
questions, and backtracking protocol.

A fat marker sketch is a VISUAL artifact rendered using excalidraw (outline shapes,
Excalifont, transparent background) — not a text list, not a code block, not prose.
Fall back to HTML with bordered boxes if excalidraw is unavailable (requires the
canvas with an active browser/Preview client — see the skill for setup and preflight). If it doesn't have
visible borders around screens and regions, it's not a sketch.
