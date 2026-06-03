# Architect review batch — 5 issues + #441 v1 shipped

**Date:** 2026-06-03
**Session:** corr-bc9066ea (architect review prompt)
**Outcome:** 5 GH issues opened; #441 v1 merged via PR #446.

## Problem

User asked for architect + agentic-SME review of `claude-config`. Review surfaced 5 candidate gaps. User wanted them tracked as GH issues per `feedback_plans_md_no_per_issue` SSOT pattern, then execution starting with the highest-leverage gap.

## Systems analysis

- Repo state (sampled via Explore agent): 8 HARD-GATE rules under explicit cap + GOVERNANCE.md three-condition gate, 22 skills, 7 hooks, 21 ADRs, 12 rules-eval suites. Decoupled-by-anchor pattern. Strong ADR↔rule cross-link.
- Weak areas surfaced in review: planning-pipeline eval (false — see below), SKILL.md schema gap, substrate-cost telemetry gap, anchor-content drift, adversarial-hook scope-tier gating.

## Decisions

### Architect review claim that was wrong

Original review claimed planning-pipeline trio "flies without discriminating eval." False — `rules-evals/README.md` lines 60-61 route the floor trio's eval home to `skills/define-the-problem/evals/` + `skills/systems-analysis/evals/`. Verified via direct read. DTP suite has 10 cases covering all 8 pressure-framing categories, named-cost emission contract, sentinel bypass, Trivial tier (genuine + pressure-framing variants), Expert Fast-Track `Validating my understanding:` emission, bug-fix routing, and solution-as-problem pushback. SA suite has 11 cases covering Stage Visibility (SA + Solution Design markers), authority-low-risk, sunk-cost multi-turn, fatigue, named-cost skip, greenfield, surface-grievance.

This was caught BEFORE swarming on a false premise. Per `feedback_verify_state_claims` — automated narratives (the original review wrote) can silently lie; verify against ground truth (the actual eval JSON) before acting.

### Real gaps after audit

Zero coverage across DTP, SA, and 11 `rules-evals/` suites for:

1. **Checkpoint emission** — `[Checkpoint] Problem: X. Systems: Y. Approach: Z. → Entering detailed design.` line at major-stage transitions
2. **Sequential Thinking bounded contract** — opt-in only, max 8 thoughts, max 1 branch, required output sections
3. **Multi-Session Continuity breadcrumb offer** — offer to save `docs/superpowers/decisions/YYYY-MM-DD-<topic>.md` after approach selected (this file is itself an exercise of this gap)
4. **DTP Stage marker** — `[Stage: Problem Definition]` emission on DTP entry (SA asserts its own marker, DTP does not)
5. **Non-Trivial tier announcements** — Prototype/POC, Feature, System/Platform tier disclosure (only Trivial covered)

### What shipped (#441 v1)

PR #446, commit d9b743c. Merged 2026-06-03 01:34Z.

- Pick 1: new SA eval `checkpoint-emission-sa-to-solution-design`
- Pick 3: new DTP eval `multi-session-breadcrumb-offer-green`
- Pick 4: `[Stage: Problem Definition]` regex assertion added to 6 DTP-routing cases (`authority-sunk-cost`, `solution-as-problem-pushback`, `just-brainstorm-underspecified`, `trivial-tier-pressure-framing-no-criteria`, `time-pressure-ship-by-friday`, `exhaustion-just-give-me-code`)

Picks 2 (Sequential Thinking) and 5 (Non-Trivial tier announcements) deferred — separate follow-up issues to be opened.

### Five issues opened for the broader review

| # | Title | Priority |
|---|---|---|
| 441 | rules-evals: planning-pipeline discriminating signal | 1-high (CLOSED — merged) |
| 442 | tests: SKILL.md schema + slash-trigger collision check | 2-medium |
| 443 | substrate-cost: per-rule tokens-per-turn budget + 250 LOC ceiling | 2-medium |
| 444 | tests: anchor-content snapshot (Phase 1j extension) | 3-low |
| 445 | hooks: scope-tier-gate adversarial swarm trigger | 2-medium |

## Constraints applied

- `feedback_swarm_no_api_billing` — eval-runner-v2 is billing path; deferred live smoke to post-merge action items
- `feedback_advisory_bold_pair_regex` — every new assertion regex pinned to format (literal `[Checkpoint]`, `\[Stage:\s*Problem Definition\]`, `docs/superpowers/decisions/`) not term proximity
- `feedback_eval_silent_path_prompts` — breadcrumb GREEN prompt engineered to force adjacent verbal output ("anything we should do before I close the session")
- ADR #0019 discriminating signal — each new assertion tested at its specific boundary
- `feedback_plans_md_no_per_issue` — issues opened, not Plans.md lines added
- `feedback_docs_6th_grade_reading_level` — issue bodies use short sentences, plain words

## Open follow-ups for next session

1. **Live eval smoke on #446 changes** — gated on credit refill. Run:
   - `bun tests/eval-runner-v2.ts --skill systems-analysis --filter checkpoint-emission-sa-to-solution-design`
   - `bun tests/eval-runner-v2.ts --skill define-the-problem --filter multi-session-breadcrumb-offer-green`
   - Full DTP + SA suites for Pick 4 Stage marker regression check
2. **Open follow-up issues** for Pick 2 (Sequential Thinking bounded contract eval, M) and Pick 5 (Non-Trivial tier announcement evals, M)
3. **Pick next architect-review issue** to execute. Recommended order by leverage:
   - #443 substrate-cost budget (highest leverage, touches token mass under #435 compression workstream)
   - #442 SKILL.md schema + collision (cheapest, prevents drift at N=30+ skills)
   - #444 anchor-content snapshot (insurance on `rules/` SSOT pattern)
   - #445 scope-tier-gate adversarial hooks (cost reduction on Trivial-tier edits)

## Confidence

Dry-run + reviewer-approved + format-pinned regex = high confidence #441 v1 passes live eval. Confidence LOW until live run because eval-runner spawns fresh `claude --print` with no in-session priming on planning-pipeline.md (rule IS loaded at session start though).
