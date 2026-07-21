# RED/GREEN discrimination runbook (ADR #0005 §4)

[ADR #0005](../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) §4
requires a behavioral rule's discrimination to be **demonstrated, not asserted**: its
eval suite must pass with the rule present (**GREEN**) and fail with the rule removed
(**RED**), with the eval output from both recorded in a `REDGREEN.md` beside the suite.

This runbook is the procedure. `rules-evals/execution-mode/REDGREEN.md` is the worked
reference example. `rules-evals/verification/REDGREEN.md` is a cautionary case: its first
run was invalidated by a harness bug (`@file` prompts the runner never expands, so the model
never saw the scenario) — read it before trusting a matrix, and confirm the model actually
received the scenario before drawing any §4 conclusion.

## The harness

```
./bin/redgreen.fish <rule-name> [--green N] [--red N] [--dry-run]
```

- `--dry-run` exercises the strip→restore cycle and runs the suite with the runner's
  own `--dry-run` — **no `claude` sessions, no window spend.** Always dry-run first.
- The only variable is the `~/.claude/rules/<rule>.md` symlink target; the suite JSON is
  never the variable. The harness captures the original target via `readlink`, repoints
  it to an emptied file for the RED phase, and restores it (trap + explicit, never `rm`).
- Logs land in `/tmp/redgreen-<rule>-logs/`; the printed matrix line per run is the
  headline, the per-eval `✓/✗` and `Failures:` blocks are in each log.

**Cost & safety.** Live runs spawn real Claude Code sessions on your Max subscription
and consume the shared usage window (rolling 5-hour + weekly). One proof ≈ `green+red`
runs × the suite's eval count. The rule is briefly stripped from `~/.claude` for **all**
sessions during the RED phase — don't run concurrent interactive work during a live proof.

## Authoring the REDGREEN.md

Match the structure of the reference proofs:

1. **Method** — one paragraph: what the variable is, run counts, flags.
2. **Result matrix** — one row per eval, columns per phase (GREEN ×N, RED-strip ×N),
   `✓`/`✗` per cell, plus `evals passed` totals.
3. **Discrimination verdict** — GREEN N/N (flake-stable) vs RED M/N; how many cells flip.
4. **Documented limitations** — see the two patterns below.
5. **Transcript references** + acceptance checklist.

### Read the matrix honestly — two failure patterns

- **Control cells** — an eval where the rule-compliant answer *is* the rule-absent
  default (e.g. a "skip" path) passes in every condition. It cannot discriminate; label
  it a control, not a discriminator. (See execution-mode cell 4.)
- **Over-determined cells** — a rule that states a claim redundantly may be re-derived
  by the model from surviving structure even after the clause is stripped, so a surgical
  RED only flips it some of the time. Record it as a §4 finding; do not delete extra rule
  text to force a flip (that removes *more than the clause the claim adds*). (See
  execution-mode cell 5.)

**Soft rules may not flip at all.** Rules whose behavior overlaps base-model habit
(`verification`, `tdd-pragmatic`) may show GREEN ≈ RED. That is a legitimate, valuable
outcome — evidence the rule is partly redundant with default behavior — and it must be
**documented as the finding**, never papered over with a manufactured RED.

## Backlog — suites lacking a committed proof

| Suite | HARD-GATE? | Status |
|---|---|---|
| `execution-mode` | yes | ✅ proof committed (reference) |
| `verification` | no (soft) | 🔧 suite repaired (harness bug fixed); live re-proof queued |
| `goal-driven` | yes | ⬜ backlog |
| `pr-validation` | yes | ⬜ backlog |
| `disagreement` | yes | ⬜ backlog |
| `think-before-coding` | yes | ⬜ backlog |
| `memory-discipline` | yes | ⬜ backlog |
| `fat-marker-sketch-rule` | yes | ⬜ backlog |
| `agency-preservation` | (aux) | ⬜ backlog |
| `hard-gate-cap` | (aux) | ⬜ backlog |
| `scope-tier-memory-check` | (aux, hook-backed) | ⬜ backlog |

Each backlog entry is one `./bin/redgreen.fish <suite>` run + a `REDGREEN.md`. Budget the
window spend before starting; prioritize the HARD-GATE rows.
