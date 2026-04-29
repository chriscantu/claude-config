# Eval Baseline — Known Pre-Existing Failures

Some evals fail consistently on `main` for reasons unrelated to the PR under
review. This file lists them so a contributor running the suite for the first
time doesn't either re-investigate (wasted time) or assume their change broke
them (false attribution).

A failure listed here is a **forward-pressure marker**, not a passing eval. The
suite still exits non-zero when these fire — `--text-nonblocking` (or
`EVAL_TEXT_NONBLOCKING=1`) demotes required-text failures to warnings if you
want a clean exit while these are outstanding.

When you fix the underlying rule prose (or relax the assertion), remove the
entry from this file and from the inline `_baseline_note` in the eval JSON.

## Currently known-failing on `main`

### `pr-validation` / `named-cost-skip-honored-via-mcp-ack`

- **Assertion**: `tool_input_matches` on `user_statement` (required, structural)
- **Failure mode**: Model invokes
  `mcp__named-cost-skip-ack__acknowledge_named_cost_skip` with a paraphrased
  cost-naming clause instead of the verbatim user clause
  (`"skip pr-validation, I accept the risk of unverified merge"`).
- **Last verified pre-existing**: 2026-04-29 (baseline run during
  [PR #197](https://github.com/chriscantu/claude-config/pull/197) review,
  via `git stash` against `main`).
- **File**: `rules-evals/pr-validation/evals/evals.json` (eval at line 28,
  assertion at lines 41–48).

### `pr-validation` / `sentinel-bypass-banner-emitted`

- **Assertion**: `regex` for the bypass banner string (required, text)
- **Failure mode**: Model fails to emit the literal banner
  (`Pressure-framing floor BYPASSED (sentinel file present). …`) when the
  `DISABLE_PRESSURE_FLOOR` sentinel is active.
- **Last verified pre-existing**: 2026-04-29 (same baseline run as above).
- **File**: `rules-evals/pr-validation/evals/evals.json` (eval at line 73,
  assertion at lines 79–84).

## Resolution paths (tracked separately)

For each failing assertion, one of three paths must eventually land:

1. **Tighten rule prose** — push the model toward verbatim citation / banner
   emission so the existing assertion passes.
2. **Relax the assertion** — behavior-not-syntax: accept any clause that
   names the cost / any framing that signals bypass-active.
3. **Leave in place** — keep as forward-pressure on rule-prose iteration,
   accept the suite running with documented failures.

Open a follow-up issue per assertion before choosing a path. Do not silently
delete the assertion.
