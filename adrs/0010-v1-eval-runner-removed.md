# ADR #0010: v1 eval runner removed (Step 3 of #0009)

Date: 2026-04-25

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
POC

## Status
Accepted (2026-04-25)

## Context

[ADR #0009](0009-eval-runner-v2-canonical.md) declared the v2 eval runner
canonical and laid out a three-step retirement plan for v1:

1. Freeze v1 to new evals.
2. Migration window opens when [#92](https://github.com/chriscantu/claude-config/issues/92)
   closes — surviving regex-only assertions migrate to v2.
3. Delete v1 within 30 days of #92 close.

Status as of 2026-04-25:

- #92 closed today via [PR #162](https://github.com/chriscantu/claude-config/pull/162)
  (commit 98079d7). Audit + structural ports landed; FMS evals went 0 → 7
  structural anchors.
- [#142](https://github.com/chriscantu/claude-config/issues/142) (FMS structural
  assertion split from #92) verified as already-resolved by #162; closed.
- All evals across pilot skills + rules-layer pass under v2's `--dry-run`
  (49/49 evals, 180/180 assertions at time of writing — schema + regex
  compile).
- v1 (`tests/eval-runner.ts`) holds no unique evals; every signal v1 covers
  is also covered by v2.

The 30-day migration window is not load-bearing — it was an upper bound to
allow surviving regex-only assertions to port. With the audit complete and
no migration debt, early cut is safe.

## Decision

Execute Step 3 of ADR #0009 immediately:

1. **Delete `tests/eval-runner.ts`.** The v1 runner module is removed.
2. **Drop `evals:v1` from `package.json`; rename `evals:v2` → `evals`.**
   The canonical script is now `bun run evals`. No `evals:v2` alias is added —
   the repo is the only consumer; a grep confirmed no external references.
3. **Update `tests/EVALS.md`.** v1 references stripped; the runner section
   collapses to a single canonical block. Historical context preserved by
   linking to ADR #0009 (now Superseded) and this ADR.
4. **Update `bin/new-skill`.** The "Next steps" hint now mentions `bun run evals`
   alongside the direct path.
5. **Mark ADR #0009 Superseded.** Status flipped to point at this ADR.
6. **No `tests/evals-lib.ts` cleanup required.** v1 had zero internal imports
   (audit: `grep "from.*evals-lib"` shows only v2 + the lib's own test consume
   it). Nothing to strip.

## Alternatives Considered

**A. Wait the full 30-day window before cutting v1.** The ADR allowed up to
2026-05-25. Rejected: the window was an upper bound to absorb migration
slippage. With #92 + #142 both closed and no surviving regex-only assertions
needing port, holding v1 just accumulates the three failure modes #0009
named (substrate ambiguity, maintenance debt, eval-quality regression).

**B. Keep `evals:v2` as an alias under the new `evals` name.** Rejected:
no external script references it. Adding a dead alias preserves the v1/v2
distinction this ADR is removing.

**C. Delete `adrs/0009-eval-runner-v2-canonical.md`.** Rejected: the freeze
decision is part of the historical record. Supersede-by-pointer matches the
pattern used by #0007 (rejected) and #0006 (rejected) — kept on disk, status
flipped, downstream readers walk the chain.

## Consequences

- New contributors see one canonical runner. No "which one do I use?"
- `package.json` script surface narrows: `evals` instead of `evals:v1` /
  `evals:v2`.
- `validate.fish` and CI commands can shorten to `bun run evals --dry-run`
  in future updates without breaking the v1/v2 distinction.
- Anyone with a local script invoking `bun run evals:v2` directly will need
  to update to `bun run evals`. The repo is the only consumer; no broader
  rollout needed.

## Verification

Per `rules/verification.md`:

- `bun run evals --dry-run`: 49/49 evals, 180/180 assertions pass schema +
  regex compile.
- `./bin/validate.fish`: pass.
- Grep across repo: no remaining `evals:v1` / `evals:v2` script invocations
  outside ADR #0009 (historical) and `.claude/settings.local.json` cosmetic
  permission entries (pre-existing; not in this ADR's scope).

## Related

- [ADR #0009](0009-eval-runner-v2-canonical.md) — supersedes
- [#86](https://github.com/chriscantu/claude-config/issues/86) — v2 substrate
- [#89](https://github.com/chriscantu/claude-config/pull/89) — initial structural ports
- [#92](https://github.com/chriscantu/claude-config/issues/92) — assertion-type audit
- [#139](https://github.com/chriscantu/claude-config/issues/139) — retirement plan tracking
- [#142](https://github.com/chriscantu/claude-config/issues/142) — FMS structural split
- [#162](https://github.com/chriscantu/claude-config/pull/162) — audit close PR
