# Rules reduction — rollback triggers

This is the Phase 0 artifact for the rules-reduction program (issue
[#527](https://github.com/chriscantu/claude-config/issues/527)).

A rule that stops working does not raise an alarm. This is a solo config. No
second user notices when a guardrail quietly dies. The gap between "the rule
broke" and "I found out" can be weeks.

These triggers close that gap. Each one says three things in advance: what a
regression looks like, how we detect it, and what number sends us back. Writing
them down before the cut is the point. After the cut, "did this get worse?" has
no answer you can trust.

This closes the gap named in issue
[#124](https://github.com/chriscantu/claude-config/issues/124).

## Baseline captured 2026-09-19

Structural baseline, from `bun run tests/eval-runner-v2.ts --dry-run`:

- **198/198 evals valid, 607/607 assertions valid, exit 0** across all suites
  (skills plus rules).
- `tests/EVAL_BASELINE.md` lists **no** known-failing evals.
- Rules layer only: **12 suites, 68 evals, 96 required-tier assertions, 133
  assertions total.**

Per-prompt load at baseline:

| Class | Files | Chars | Share |
|---|---|---:|---:|
| Boundary | disagreement, pr-validation, memory-discipline, verification | 12,776 | 28% |
| Process | planning-pipeline, think-before-coding, goal-driven, execution-mode, fat-marker-sketch, tdd-pragmatic | 21,369 | 48% |
| Scaffolding | skip-contract, pressure-framing-floor | 10,653 | 24% |
| **Rules total** | 12 | **44,798** | ≈11.2k tokens |
| `global/CLAUDE.md` | 1 | 8,734 | ≈2.2k tokens |

## Live baseline captured 2026-09-21

Live run of all 12 rules suites, subscription auth
(`env -u ANTHROPIC_API_KEY bun run tests/eval-runner-v2.ts <suite>`):

| Suite | Evals | Required pass/fail | Diagnostic pass/fail |
|---|---:|---:|---:|
| agency-preservation | 3 | 8/1 | 3/0 |
| code-clarity | 2 | 4/0 | 2/0 |
| disagreement | 8 | 19/3 | 0/2 |
| execution-mode | 5 | 10/0 | 5/1 |
| fat-marker-sketch-rule | 4 | 7/2 | 0/0 |
| goal-driven | 4 | 11/1 | 2/1 |
| hard-gate-cap | 4 | 9/3 | 2/0 |
| memory-discipline | 8 | 2/0 | 8/0 |
| pr-validation | 11 | 12/0 | 5/3 |
| scope-tier-memory-check | 10 | 8/3 | 1/1 |
| think-before-coding | 6 | 7/3 | 2/2 |
| verification | 3 | 5/1 | 1/0 |
| **Total** | **68** | **102/17** | **31/10** |

Zero runs died on transport or API error.

**The live baseline is not all-green.** 17 required-tier assertions fail today.
That is the number to hold, not a bar to clear first. A Phase 2 cut regresses if
a suite's required pass count drops **below the value in this table**.

### How to read these numbers

- **Structural tier gates. Text tier is noisy.** Each suite ran once. Treat a
  ±1 text-tier swing as noise, not signal. Re-run a suspect suite 3–5 times
  before calling a regression, per `rules-evals/REDGREEN-RUNBOOK.md`.
- **`scope-tier-memory-check` reported 3 silent-fire failures** — required-tier
  negative assertions that passed against empty signals. Those passes are not
  evidence. Its real required-tier pass count is at most 5/11.
- **Run dates are mixed.** `verification`, `think-before-coding` and
  `scope-tier-memory-check` ran 2026-09-21 after a session-limit 429 killed the
  first attempt. The other nine are from the 2026-09-19/20 runs. Rules text did
  not change between those runs.
- Required-tier assertions **emitted** (119) exceed the count of `"tier":
  "required"` keys in the suite JSON (116). The gap is unreconciled; use the
  emitted per-suite numbers above, since those are what a future run compares
  against.

### What the structural baseline still does not cover

The dry-run proves each suite **loads and is well formed** — 198/198 evals,
607/607 assertions, re-confirmed 2026-09-21. It never runs the model, so it
cannot detect a rule that loads fine and stops working.

## Live baseline on Opus 5.5, captured 2026-09-24

The 2026-09-21 table above ran on Opus 4.8. The eval runner now defaults to
`claude-opus-5-5`. A Phase 2 run compares against **this** table, because a
model change can move the numbers on its own. Rules text is the same as in the
2026-09-21 run.

| Suite | Evals | Runs | Required pass/fail | Diagnostic pass/fail | Was (4.8) |
|---|---:|---:|---:|---:|---:|
| agency-preservation | 3 | 1 | 8/1 | 3/0 | 8/1 |
| code-clarity | 2 | 1 | 4/0 | 2/0 | 4/0 |
| disagreement | 8 | 1 | 19/3 | 1/1 | 19/3 |
| execution-mode | 5 | 1 | 10/0 | 5/1 | 10/0 |
| fat-marker-sketch-rule | 4 | 1 | 7/2 | 0/0 | 7/2 |
| goal-driven | 4 | 3 | 10/2 | 1/2 | 11/1 |
| hard-gate-cap | 4 | 3 | 12/2 | 2/0 | 9/3 |
| memory-discipline | 8 | 3 | 2/0 | 8/0 | 2/0 |
| pr-validation | 11 | 3 | 9/3 | 4/4 | 12/0 |
| scope-tier-memory-check | 10 | 3 | 9/5 | 1/1 | 8/3 |
| think-before-coding | 6 | 3 | 9/1 | 3/1 | 7/3 |
| verification | 3 | 3 | 6/0 | 1/0 | 5/1 |
| **Total** | **68** | | **105/19** | **31/10** | **102/17** |

Logs: `~/.claude/logs/eval-baseline-opus-5-5-2026-09-24/`. The `baseline/`
folder holds the first run of all 12 suites. The `rerun/` folder holds 3 more
runs of 7 suites.

### How to read the Opus 5.5 numbers

- **7 suites are medians of 3 runs. 5 are single runs.** The 7 re-run suites
  (`Runs` = 3) ran on clean `main` at `ef686f0`. During the first run, at
  21:54Z, an uncommitted edit to `rules/verification.md` landed in the working
  tree. Every suite that could have seen it was re-run 3 times on a clean tree.
  The 5 single-run suites finished before 21:54Z. Their numbers match the
  Opus 4.8 table exactly.
- **Compare pass counts, not fail counts.** Some suites now report more
  required-tier checks than before: `hard-gate-cap` reports 14 (was 12) and
  `scope-tier-memory-check` reports 14 (was 11). A higher fail count on a
  bigger total is not a drop. The regression test stays the same: a suite's
  required **pass** count falls below this table.
- **`pr-validation` fell from 12/0 to 9/3, in all 3 runs.** This is likely
  phrasing drift, not a change in behavior:
  - Every failure is a text-tier regex that checks the reply **names** the
    rule. Two fail in every run: the skip contract and the gh hard-fail. The
    third varies from run to run.
  - Both structural checks pass (2/2) in every run.
  - The transcripts show the model still refusing to declare ready.

  Opus 5.5 says "no" in different words than the regexes expect. Re-check the
  regexes before trusting this suite as a Phase 2 gate. A suite that fails on
  wording cannot tell a cut rule from a rephrased refusal.
- **`scope-tier-memory-check` still reports 3 silent-fire failures per run.**
  These are required-tier negative checks that passed against an empty signal,
  so they prove nothing. Its real required pass count is at most 6/14.
- **The totals do not compare directly.** 105/19 covers 124 required checks.
  102/17 covered 119. Compare suite by suite.

## Triggers per phase

### Phase 1 — shadow hooks (no cut yet)

The hook runs and logs. Both rules stay loaded. Nothing can regress, so the
trigger is about whether the classifier is good enough to trust.

- **Regression looks like:** the hook's fire or no-fire verdict disagrees with
  what the prompt actually needed.
- **Detection:** read `~/.claude/logs/` after real use. Compare each verdict
  against the prompt it judged.
- **Threshold:** wrong on more than 1 in 10 real prompts, over at least 20
  prompts. Do not advance to Phase 2.
- **Undo:** delete the hook entry from settings.

#### What shipped (2026-09-21)

`hooks/rules-shadow.sh` plus the pure classifier in `hooks/lib/gate-classify.sh`.
The hook writes one JSON line per event to `~/.claude/logs/rules-shadow.log`:

```json
{"ts":"...","surface":"pretooluse_bash","gate":"pr-validation","trigger":"action","verdict":"fire","payload_hash":"ab3bba3f7d4ae206"}
```

It runs on three surfaces, not on `UserPromptSubmit`. Neither of these two rules
triggers on something the user types. `pr-validation` fires on a draft-promoting
command or on the agent's own claim that work is ready. `execution-mode` fires
when an implementer subagent starts. Reviewer, explorer and planner agents do not
count. A prompt-level hook would have logged verdicts
about the wrong events.

| Surface | Watches for | Gate |
|---|---|---|
| `PreToolUse` — `Bash` | `gh pr ready`, `gh pr merge`, `gh pr edit --remove-label draft` | pr-validation |
| `PreToolUse` — `Task` / `Skill` / `Agent` | an implementer subagent starting, or the subagent-driven-development skill | execution-mode |
| `Stop` | the agent's last message claiming the work is ready | pr-validation |

The log stores a hash of the command or message, never the text itself. Commands
and messages carry tokens and names, and this repo is public.

The same two classifier functions are what Phase 2 would use to inject guidance
once the rule text is unlinked. They are not a throwaway. If Phase 2 were to
write its own, Phase 1 would have measured a classifier that never ships.

**To read the sample:**

```sh
jq -r '[.ts, .surface, .gate, .verdict] | @tsv' ~/.claude/logs/rules-shadow.log
```

Judge each line against what the event actually needed. Wrong on more than 1 in
10, over at least 20 events, and Phase 2 does not start.

**Two ways to switch it off:**

- Kill-switch, no edit to any tracked file: `touch ~/.claude/DISABLE_RULES_SHADOW`
  (or `.claude/DISABLE_RULES_SHADOW` inside one project).
- Full undo: remove the `rules-shadow.sh` entries from `~/.claude/settings.json`
  and from `.claude-plugin/hooks.json`.

The hook is registered in both places on purpose. The plugin cache under
`~/.claude/plugins/` is a copy taken at install time, so a change in this repo
does not reach a running session. The `settings.json` entry points at the
`~/.claude/hooks/` symlink that `bin/link-config.fish` creates, which resolves
to this checkout — that is what makes the sample start collecting today. The
`.claude-plugin/hooks.json` entry is what a fresh install would pick up.

### Phase 2 — drop the two symlinks

This is the first real cut. `pr-validation` and `execution-mode` stop loading
on every prompt and load only when the hook injects them.

- **Regression looks like:** a gate does not fire when it should. A PR gets
  declared ready with an unexecuted test plan. A subagent dispatch starts with
  no mode announcement.
- **Detection:** run `rules-evals/pr-validation/` and
  `rules-evals/execution-mode/` with the hook active. Both must stay GREEN
  against the live baseline.
- **Threshold:** **any** drop in a required-tier assertion against baseline.
  One is enough. These are boundary rules, not process ceremony.
- **Undo:** re-link. `./bin/link-config.fish` restores the symlink.
- **Kill switch:** the sentinel file, same pattern as
  `DISABLE_PRESSURE_FLOOR`. Rolling back mid-debug should be one `touch`, not
  a revert chain.

### Phase 3 — measure the planning trio

Authoring a suite. Nothing changes. No trigger needed.

One note: if the trio **does** discriminate, that is a stop signal, not a
setback. Take the 24% from Phase 2 and stop. The rest is not safely available.

### Phase 4 — act on measured nulls

Demote `fat-marker-sketch`, collapse the scaffolding.

- **Regression looks like:** a different gate loses discrimination because the
  shared scaffolding it leaned on went away.
- **Detection:** run the full rules-evals required tier, all 12 suites. Not
  only the suite for the rule that changed.
- **Threshold:** any required-tier drop at **any** gate boundary, not just the
  one being cut. Cross-gate breakage is the whole risk here.
- **Undo:** `git revert`, then re-run the baseline to confirm recovery.

### Phase 5 — reword survivors to judgement-first

- **Regression looks like:** softer wording stops producing the behavior.
- **Detection:** per-rule RED/GREEN via `./bin/redgreen.fish`.
- **Threshold:** discrimination must hold at the same scenarios as before. A
  rule that discriminated on 2 scenarios must still discriminate on those 2.
- **Undo:** `git revert`. Prose only, so recovery is clean.

## Controls that apply to every phase

1. **Add, then remove. Two commits, never one.** Ship the new path while the
   old one still works. Remove the old path in a separate commit, after the new
   one is proven.
2. **Net LOC must fall.** Each PR reduces total repo lines, not just lines in
   `rules/`. This blocks the trap where 6,889 characters of rule become a
   700-line hook and test pair.
3. **One kill switch per lever.** Sentinel file, checked before the hook acts.
4. **Live runs get a dedicated session.** `bin/redgreen.fish` repoints
   `~/.claude/rules/<rule>.md` for **every** session while it runs. Another
   session open at the same time will silently see a stripped rule. Always
   `--dry-run` first.

## Review cadence

Read the shadow logs before advancing any phase. Re-read this file at the start
of each phase and update the thresholds if the live baseline changed what is
measurable.
