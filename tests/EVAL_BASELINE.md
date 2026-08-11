# Eval Baseline — Known Pre-Existing Failures

Some evals fail consistently on `main` for reasons unrelated to the PR under
review. This file lists them so a contributor running the suite for the first
time doesn't either re-investigate (wasted time) or assume their change broke
them (false attribution).

When you fix the underlying rule prose (or relax the assertion), remove the
entry from this file and from the inline `_baseline_note` in the eval JSON.

## Currently known-failing on `main`

None currently.

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
after verifying green. `sentinel-bypass-banner-emitted` was **retired** per
[#510](https://github.com/chriscantu/claude-config/issues/510) — it tested a
pressure-framing-floor bypass banner the pr-validation gate scenario never
produces (the model only runs the sentinel check when routing to
`Skill(define-the-problem)`, which a PR-merge prompt never does). The banner
mandate stays as prose in `rules/references/pressure-framing-bypass.md`;
designing a purpose-built eval for it is tracked in
[#512](https://github.com/chriscantu/claude-config/issues/512).
