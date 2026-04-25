---
name: SKILL_NAME
description: >
  Use when the user says /SKILL_NAME, "<trigger phrase>", or wants to <verb>.
  One sentence per trigger class. Avoid trigger overlap with existing skills —
  audit `skills/*/SKILL.md` descriptions before merging (see #73).
status: experimental
version: 0.1.0
---

# <Skill Title>

<!--
  TEMPLATE NOTES — delete this comment block before merging.

  Required frontmatter (loader-enforced via validate.fish):
    - name: must equal the directory name (kebab-case)
    - description: triggers + when-to-use; multi-line with `>` is fine

  Client-defined frontmatter (not loader-enforced; conventional):
    - status: one of `experimental` | `stable` | `deprecated` (see #76)
    - version: semver-ish; bump on behavioral change

  Body shape (progressive disclosure — see #71):
    - Keep SKILL.md thin. Push depth into `references/<topic>.md`.
    - Lead with one-line announce string the model speaks on invocation.
    - Then: When to Use / When NOT / Procedure / Backtracking / References.

  Evals:
    - At least one eval in `evals/evals.json` before status: stable.
    - HARD-GATE-promoted skills target ≥4 structural assertions per ADR #0005.
    - Reference `tests/EVALS.md` for assertion-type rubric.
-->

One-paragraph statement of what this skill does and why it exists.

**Announce at start:** "I'm using the SKILL_NAME skill to <verb the user-visible action>."

## When to Use

- <Trigger 1 — concrete user phrasing or situation>
- <Trigger 2>

## When NOT to Use

- <Anti-trigger — situation where another skill or no skill fits better>
- <Avoid overlap with: list adjacent skills>

## Procedure

1. <Step> → verify: <observable check>
2. <Step> → verify: <observable check>

## Backtracking

If <validation question> fails, return to <prior step> and <action>. Do not
advance with a known-wrong shape.

## References

Read on demand, not upfront:

<!-- - [topic.md](references/topic.md) — <one-line summary of what's there> -->
