---
description: >
  Activate before implementing any non-trivial coding task. Requires explicit,
  verifiable success criteria — and a per-step verify command — before code is
  written. Operationalizes Karpathy Coding Principle #4 (Goal-Driven Execution).
---

# Goal-Driven Execution

<HARD-GATE>
Before writing or modifying code for any non-trivial task, you MUST produce a
brief execution plan in which EVERY step has an explicit verify check. Do NOT
begin implementation until the plan exists in the response. Do NOT declare any
step complete until its verify check has been run and observed to pass.

If you catch yourself coding without a stated success criterion, STOP. Produce
the plan. Then resume.
</HARD-GATE>

<a id="verify-checks"></a>
## Verify Checks (Required Plan Shape)

A goal-driven plan transforms vague asks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"
- "Wire feature Y" → "Smoke command / curl / browser check that returns expected output"

Format (multi-step work):

```
1. [Step] → verify: [command, assertion, or observable check]
2. [Step] → verify: [command, assertion, or observable check]
3. [Step] → verify: [command, assertion, or observable check]
```

A verify check is anything that produces an objective pass/fail signal:
test command, type-check command, HTTP response, log line, screenshot,
exit code, file presence. "Looks right" is NOT a verify check.

## When to Skip

- Single-line edits with no behavioral change (typo, comment, formatting)
- Pure file moves / renames the user explicitly directed
- Throwaway exploration the user has scoped as exploration ("just poke around X")
- Emergency bypass via `DISABLE_PRESSURE_FLOOR` sentinel (see [planning.md](planning.md#emergency-bypass-sentinel)) —
  the bypass disables pressure-framing routing, not the verify discipline; if
  you skip on bypass grounds, say so

### What counts as an explicit override

Saying "skip the plan" is NOT sufficient on its own. The override must **name
the specific cost** being accepted. Valid forms: "skip the plan, I accept the
risk of unverified completion," "no verify checks, I'll catch breakage in
review," "ship without success criteria, I accept the rework risk." Generic
acknowledgements ("I accept the trade-off," "I know the risks", "your call",
"trust me") do NOT qualify — name the gate, request the specific cost
acknowledgement, and produce the plan if it doesn't come.

**Time pressure is not an override.** "Quick fix," "just do it," "5 minutes
left" make verify checks more valuable, not less — an unverified rushed change
is the most expensive thing to land.

### Pressure-framing floor

Floor enforcement ([pressure-framing routing](planning.md#pressure-framing-floor),
[named-cost emission contract](planning.md#emission-contract),
[sentinel bypass](planning.md#emergency-bypass-sentinel)) is anchored in
`rules/planning.md` DTP per-gate block. Per
[ADR #0006 rejection](../adrs/0006-systems-analysis-pressure-framing-floor.md)
and memory note `per_gate_floor_blocks_substitutable.md`, per-gate floor blocks
add no eval-measurable load given the DTP anchor.

Concrete signals here:

- **Authority** ("the team agreed to skip tests", "lead said skip the verify check")
- **Sunk cost** ("already started coding", "we've already chosen this path")
- **Exhaustion** ("just write the code", "stop with the ceremony")
- **Deadline** ("ship by Friday", "demo in 10 minutes", "needs to land today")
- **Stated-next-step** ("just write the code", "skip planning and implement",
  "no plan, straight to PR")

Honor full skip ONLY via the Emission contract below — anything else produces
the plan.

### Emission contract — MANDATORY

When a named-cost skip is valid, invoke
`mcp__named-cost-skip-ack__acknowledge_named_cost_skip` per
[planning.md#emission-contract](planning.md#emission-contract). Use
`gate="goal-driven"` and the verbatim cost-naming clause as `user_statement`.
The tool invocation IS the honor — if you skip the call, produce the plan
instead.

## Loop Until Verified

After producing the plan, execute each step and run its verify check. Treat the
verify result as ground truth:

- Pass → mark step done, move on
- Fail → diagnose, fix, re-run the SAME verify check, do NOT advance until it
  passes
- Cannot run verify (missing tool, environment, physical device) → flag
  explicitly in the response, do NOT silently mark complete

This is what enables independent looping. Strong success criteria = you can
work without constant clarification. Weak criteria ("make it work") = you
will ping the user every step.

## Relationship to Other Rules

- `verification.md` — the gate at the END (tests run, type-check runs, no
  "should work"). This rule (`goal-driven.md`) is the gate at the START
  (verify check defined per step). Together: criteria up front, enforcement
  at the finish.
- `tdd-pragmatic.md` — provides the test-first discipline that makes most
  verify checks cheap. For non-trivial logic, the verify check IS the failing
  test from TDD.
- `planning.md` — DTP and Systems Analysis happen BEFORE this rule fires.
  Goal-driven execution governs the implementation phase only.
- Karpathy Coding Principle #4 in `~/.claude/CLAUDE.md` — the soft form.
  This file is the enforced form.
