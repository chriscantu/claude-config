# sa-handoff — live RED/GREEN demonstration (ADR #0005 §4)

This file records the live runs that show the new `skills/systems-analysis/SKILL.md` Handoff step changes behavior. After the systems pass, the skill should invoke brainstorming in the same turn instead of asking "Ready to move to solution design?".

**Method.** The only variable is the `~/.claude/skills/systems-analysis` symlink target.
- GREEN points it at this branch's skill directory.
- RED points it at `main`'s directory. Both branch from the same commit, so the Handoff section is the only difference.
- A trap restored the original target after the runs, and it was verified restored.
- Runs use the subscription path (`env -u ANTHROPIC_API_KEY bun run tests/eval-runner-v2.ts sa-handoff`), 3 GREEN and 3 RED, on 2026-11-02 with Claude Code 2.1.316.

## Result matrix

Each cell lists the required assertions passed, out of 3.

| Run | GREEN (new Handoff) | RED (old Handoff) |
|---|:--:|:--:|
| 1 | 3/3 ✓ | 2/3 ✗ (no brainstorming) |
| 2 | 3/3 ✓ | 1/3 ✗ (no brainstorming, asked the stage question) |
| 3 | 3/3 ✓ | 1/3 ✗ (no brainstorming, asked the stage question) |

## Discrimination verdict

- **Discriminates, 3 of 3.** GREEN invoked `superpowers:brainstorming` in every run. RED never did.
- The `not_regex` on the stage question flipped in 2 of 3 RED runs. In RED run 1 the agent stopped without the exact wording. The structural assertion (`skill_invoked`) is the reliable discriminator.

## Documented limitations

- **First attempt was contaminated and discarded.** The first scenario (finding past 1:1 notes) overlapped this config's own `/1on1-prep` skill. The model found it, judged that the problem statement might change, and correctly took the new Handoff's exception path: it stopped and asked. The scenario now uses a domain outside this config (a food bank's driver sign-up sheet).
- **The precondition checks the stage banner, not a Skill call.** A `/systems-analysis` prompt expands the skill inline, so no Skill tool call appears for it.
- The exception path (stop when the problem statement changes) has no dedicated eval. It was observed once, in the discarded first attempt.

## Transcript references

- GREEN: `tests/results/sa-handoff-handoff-continues-to-brainstorming-v2-2026-11-02T17-12-54.md`, `…T17-13-51.md`, `…T17-14-56.md`
- RED: `…T17-16-01.md`, `…T17-16-49.md`, `…T17-17-33.md`

## Acceptance

- [x] GREEN passes on every run (3/3)
- [x] RED fails on every run (3/3)
- [x] Symlink restored and verified after the runs
