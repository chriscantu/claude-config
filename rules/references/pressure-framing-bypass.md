---
description: Emergency-bypass sentinel mechanics for the pressure-framing floor (DISABLE_PRESSURE_FLOOR)
---

# Emergency Bypass — Sentinel File Mechanics

Reference detail for the `#emergency-bypass-sentinel` stub in
[`pressure-framing-floor.md`](../pressure-framing-floor.md#emergency-bypass-sentinel).
The pressure-framing floor is the default; this sentinel file provides
runtime rollback without a revert chain. Apply this check ONLY at the
moment you have detected a pressure framing AND are about to invoke
`Skill(define-the-problem)` on pressure-framing grounds. Do NOT pre-check
on unrelated prompts.

When the check applies, run via Bash tool. The command MUST
print explicit `BYPASS_ACTIVE` or `BYPASS_INACTIVE` to stdout —
raw `test -f` returns only an exit code, which the Bash tool
does not surface reliably. Use:

```
if test -f .claude/DISABLE_PRESSURE_FLOOR || test -f ~/.claude/DISABLE_PRESSURE_FLOOR; then echo BYPASS_ACTIVE; else echo BYPASS_INACTIVE; fi
```

- stdout contains `BYPASS_ACTIVE`: do NOT invoke DTP on
  pressure-framing grounds. Route as Expert Fast-Track would
  route absent the floor. The emission contract still applies
  to genuine named-cost skips. Because bypass silently removes
  a safety rail, you MUST emit a visible banner on the FIRST
  pressure-framed prompt of the session where the bypass is
  observed — literal form:
  `⚠️ Pressure-framing floor BYPASSED (sentinel file present). Delete ~/.claude/DISABLE_PRESSURE_FLOOR or ./.claude/DISABLE_PRESSURE_FLOOR to restore.`
  The banner goes BEFORE any routing response. Subsequent
  pressure-framed prompts in the same session may omit the
  banner to reduce noise, but the bypass behavior still
  applies.
- stdout contains `BYPASS_INACTIVE`: your NEXT tool invocation
  MUST be a `Skill` tool-use with `skill="define-the-problem"`.
  You MAY emit at most one short preface line before that
  tool-use: either the canonical `[Stage: Problem Definition]`
  marker required by Stage Visibility, or a single routing
  sentence (e.g., "Pressure framing detected — routing to
  DTP."). Do NOT describe the floor mechanics, do NOT explain
  that DTP applies, and do NOT list the skip phrasing as an
  alternative in lieu of invoking the tool — the `Skill`
  tool-use IS the application of the floor. A response that
  stops at text after `BYPASS_INACTIVE`, or uses the preface
  allowance to narrate the floor instead of invoking the
  skill, is a floor-bypass and is forbidden.

Do NOT guess the result from empty output. If stdout is empty
or ambiguous, the check failed — treat as `BYPASS_INACTIVE`
and invoke the Skill tool as above. The check is the rollback
safety valve, not an optional suppression — running the check
AND finding `BYPASS_INACTIVE` MUST result in a Skill tool-use
for `define-the-problem` as the immediate next action.
Skipping the check on a pressure-framed prompt without running
it is equivalent to bypassing the floor and is forbidden.

To enable the bypass, a user creates either file:

- Project-local: `./.claude/DISABLE_PRESSURE_FLOOR` (checked first)
- Global: `~/.claude/DISABLE_PRESSURE_FLOOR` (fallback)

File existence alone triggers bypass — content ignored. Bypass is
intentionally visible: `ls ~/.claude/ .claude/ 2>/dev/null | grep
DISABLE_PRESSURE_FLOOR`. Prefer fixing regressions over leaving
the flag on — a permanent bypass defeats the floor entirely.
Delete the file to restore.
