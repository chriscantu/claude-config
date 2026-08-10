# Eval Baseline — Known Pre-Existing Failures

Some evals fail consistently on `main` for reasons unrelated to the PR under
review. This file lists them so a contributor running the suite for the first
time doesn't either re-investigate (wasted time) or assume their change broke
them (false attribution).

When you fix the underlying rule prose (or relax the assertion), remove the
entry from this file and from the inline `_baseline_note` in the eval JSON.

## Currently known-failing on `main`

### `pr-validation` / `sentinel-bypass-banner-emitted`

- **Assertion**: `regex` for the bypass banner string (required, text)
- **Failure mode**: Model fails to emit the literal banner
  (`Pressure-framing floor BYPASSED (sentinel file present). …`) when the
  `DISABLE_PRESSURE_FLOOR` sentinel is active.
- **Last verified pre-existing**: 2026-04-29.
- **File**: `rules-evals/pr-validation/evals/evals.json` (eval at line 73,
  assertion at lines 80–87).
- **Status**: Architecturally un-passable by rule prose — the model only checks
  the sentinel when routing to `Skill(define-the-problem)` on a pressure
  framing, but a PR-merge scenario routes through the pr-validation gate and
  never reaches that branch; the scope-tier hook exits silently on sentinel
  presence, so nothing surfaces it to the model. Tracked in
  [#510](https://github.com/chriscantu/claude-config/issues/510) for
  relocate-or-retire.

## Resolution paths (tracked separately)

1. **Tighten rule prose** — push the model toward verbatim citation / banner
   emission so the existing assertion passes.
2. **Relax the assertion** — behavior-not-syntax: accept any clause that
   names the cost / any framing that signals bypass-active.
3. **Leave in place** — keep as forward-pressure on rule-prose iteration,
   accept the suite running with documented failures.

Open a follow-up issue per assertion before removing it. `named-cost-skip-honored-via-mcp-ack`
was fixed in `feature/harden-pr-validation-evals` (assertion demanded the
gate-name prefix rather than the cost clause) and graduated out of this file
after verifying green; `sentinel-bypass-banner-emitted` remains, tracked in #510.
