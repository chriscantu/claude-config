# ADR #0021: Remit-level north-star + 2 guardrails — local-event-log substrate, GitHub proxy for public signal

Date: 2026-05-24

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
POC

## Status
Proposed

## Context

Issue [#417](https://github.com/chriscantu/claude-config/issues/417) framed
the problem: the stated remit is *"thought partner for senior engineering
leaders (Director / VP / senior ICs),"* but the implicit success metric
today is *"more rules, more evals, more ADRs."* None of those measure
whether the remit is met. The architectural audit that produced #415–#418
identified this as the #1 cause of roadmap drift: without a remit-level
metric, the next 80 commits will optimize whatever is easiest to count
(eval phases, validator coverage, rule splits) instead of what the README
header claims.

Constraints discovered during scan:

- **No central server.** Distribution is hybrid plugin + git-clone
  (ADR #0018). There is no ingest endpoint and no plan to run one solo.
- **Privacy default is local-only.** The project ships
  `rules/disagreement.md` and `rules/memory-discipline.md`; shipping
  default-on telemetry would contradict the posture.
- **One maintainer.** Any substrate that requires ongoing ops attention
  (rotating keys, monitoring ingest pipelines, GDPR handling) is
  infeasible.
- **Marketplace publish pending.** GitHub plugin-dependents graph and
  install counts become available only after #0018 Validation items 4 + 5
  close. Pre-publish, public signal is limited to repo stars and
  issue/PR references.

## Decision

Adopt one north-star metric, two guardrails, and a two-track substrate
(local self-instrumentation now; GitHub proxy for public signal
post-marketplace).

### North-star

**Leadership-toolkit engagement rate within 7 days of install (LE7).**

Of installs that record at least one event in the local usage log, the
percentage that invoke ≥1 leadership-toolkit skill within 7 days of first
event. Leadership-toolkit skills (canonical list): `/onboard`,
`/strategy-doc`, `/stakeholder-map`, `/swot`, `/1on1-prep`, `/present`,
`/architecture-overview`.

Why this metric: it directly measures the remit-fulfillment hypothesis —
that installers who showed up for the planning-pipeline / anti-sycophancy
discipline actually engage the leadership toolkit. If LE7 trends low,
the README header is over-promising or the toolkit surface is
under-discoverable.

### Guardrail 1 — Return-use within 30 days (RU30)

Of installs that invoke at least one leadership-toolkit skill, the
percentage that invoke ≥1 leadership-toolkit skill again within 30 days.

Catches the "tried once, abandoned" failure mode. RU30 high + LE7 low →
discovery problem. RU30 low + LE7 high → first-touch novelty wears off
and the toolkit doesn't earn the second turn.

### Guardrail 2 — Skill-mix breadth (SMB30)

Median count of *distinct* leadership-toolkit skills invoked per active
install per 30-day window.

Catches the "uses `/onboard` once at install, ignores the rest" failure
mode. Low SMB30 argues for tighter integration between leadership skills
(e.g., `/onboard` handing off to `/stakeholder-map` and `/1on1-prep`
inside its own flow) rather than relying on users to discover them.

### Substrate

**Track 1 — Local event log (now).** A `UserPromptSubmit` hook records
slash-command invocations to `~/.claude/usage.jsonl` (append-only, JSONL,
human-readable). Schema:

```jsonl
{"ts":"2026-05-24T18:00:00Z","event":"skill_invoked","skill":"/onboard","session":"<id>"}
```

Local-only by default. Voluntary share: a future `bin/share-usage.fish`
script summarizes the log (counts only, no skill-argument content, no
session IDs) and either prints to stdout for paste into an issue, or
opens a `gh issue create` pre-filled with the summary. No automated
upload. Users who don't enable the hook contribute zero signal — opt-in
by hook installation.

**Track 2 — GitHub proxy (post-marketplace).** Once `#0018` Validation
items 4 + 5 close and the plugin publishes:

- Plugin install count (marketplace API)
- Public repos in the plugin-dependents graph
- Issue/PR references to leadership-toolkit skill names
- Repo stars (weak signal, kept for trend only)

These are public-by-construction and require no per-user opt-in.

### One-line metric definition

Committed to `docs/operations.md` § Remit Metrics (see this PR). Single
authoritative source — README, ADRs, and future roadmap docs reference
that section rather than restating.

## Consequences

### Positive

- Roadmap can now be argued for or against against a stated metric, not
  vibes. PRs that don't move LE7 / RU30 / SMB30 (or a measured proxy)
  need to justify themselves on different axes.
- Telemetry stays opt-in and local-only by default — matches the
  project's anti-sycophancy / privacy posture.
- Zero new infrastructure. One hook script + one append-only file. The
  share path is human-mediated.

### Negative

- Track 1 fidelity is low pre-share — without voluntary uploads, the
  maintainer sees only their own usage log. Bootstrap problem: need
  early-adopter volunteers to seed the dataset.
- LE7 numerator/denominator both come from the same opt-in pool —
  self-selection bias. Track 2 signals are needed for triangulation
  but are blocked on marketplace publish.
- Defining "leadership-toolkit skill" hardcodes a list that will drift.
  When new leadership skills land (per the open `#13`/`#17`/`#18`/
  `#20-42` skill backlog), the canonical list in this ADR must update or
  the metric undercounts.

### Neutral / follow-ups

- Build the hook script + share path: separate issue (not blocking this
  ADR — decision is the artifact).
- Define "active install" precisely for SMB30 denominator: 1 leadership
  invocation in the 30-day window. Documented in `docs/operations.md`.
- Periodic review: after marketplace publish, re-evaluate whether
  Track 2 signals alone are sufficient and Track 1 can be retired.

## Alternatives considered

### A — Opt-in telemetry endpoint

Hook posts events to a central ingest server. Highest fidelity. Rejected:
no server today, no plan to operate one, contradicts privacy posture,
single-maintainer operational burden.

### B — First-run survey

`bin/first-run.fish` asks "what brought you here / what will you use?"
Stored locally, optionally pasted. Rejected as primary: one-shot,
self-reported intent ≠ measured behavior. Kept as supplementary signal
(could land later as a `bin/first-run.fish` extension).

### C — GitHub proxy only

Skip Track 1 entirely. Rejected for *now*: blocked on marketplace
publish (which itself depends on #0018 items 4 + 5). Track 1 is the
bridge. Once Track 2 is live and shows trend, Track 1 can sunset.

### D — No metric, ship by intuition

Status quo. Rejected — the audit that produced this ADR was precisely
the failure mode of "no metric."

## Related

- Issue #417 (parent — defines this work)
- ADR #0018 (distribution shape — gates Track 2 substrate)
- Issue #418 (HARD-GATE rule-mass audit — peer architectural concern)
- Issues #13, #17, #18, #20–42 (leadership-skill backlog — supplies the
  canonical leadership-toolkit list and drives SMB30 expansion)
- `docs/operations.md` § Remit Metrics (one-line definition,
  authoritative)
