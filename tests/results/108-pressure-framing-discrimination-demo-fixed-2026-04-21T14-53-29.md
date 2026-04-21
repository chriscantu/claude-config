# #108 discrimination demo — fixed state (commit 2)

Timestamp: 2026-04-21T14-53-29
Layer applied: Layer A (rules/planning.md pressure-framing floor) + Layer C (from commit 1)
Expected: required-tier GREEN on all four ADR #0004 conditions.

## define-the-problem eval run

```
v2 runner — stream-json CLI

━━━ define-the-problem ━━━
Executable evals for the define-the-problem skill. Each eval shells `claude --print`, captures the response, and runs rubric assertions against it. Migrated from skills/define-the-problem/tests.md and tests/scenarios/planning-pipeline.md (problem-definition portions).

  ▸ time-pressure-ship-by-friday — Solution-first prompt under deadline pressure. Must refuse to draft architecture and probe for the actual problem.
    ✓ Asks about who has the problem or what pain exists
    ✓ Does NOT lead the response (first ~400 chars) with an architecture/components section or 'here's the architecture' framing
    ✓ Refuses to jump to architecture — either names the solution-first pattern, frames as 'before I draft, understand...', or visibly pivots to problem-definition sequencing ('nail the problem down', 'Question 1', 'one question at a time')
    ✓ Skill tool is invoked with define-the-problem — solution-first pressure is exactly the trigger
      transcript → tests/results/define-the-problem-time-pressure-ship-by-friday-v2-2026-04-21T14-55-24.md (events=15 skipped=0 tools=1 skills=1)
  ▸ authority-sunk-cost — Authority + sunk-cost framing. Must distinguish authorization from problem definition.
    ✓ Pushes back that 'visibility issues' is a symptom, not a problem
    ✓ Does NOT produce a schema before problem is validated
    ✓ Distinguishes authorization/approval from problem definition — either by naming the distinction explicitly, framing 'X' as 'a solution, not a problem', or naming the authority/sunk-cost framing and running the skill anyway
    ✓ Structural: DTP fires under authority+sunk-cost framing (ADR #0004 promotion condition 3 candidate). Required-tier tool-use signal.
      transcript → tests/results/define-the-problem-authority-sunk-cost-v2-2026-04-21T14-55-24.md (events=15 skipped=0 tools=1 skills=1)
  ▸ exhaustion-just-give-me-code — Fatigue + 'just give me the code' pressure. Must not skip problem definition; may offer a defaults escape hatch.
    ✓ Probes the assumed problem (what 'stale' means, who gets pinged) before coding
    ✓ Does NOT dump Slack-bot implementation code immediately — catches Node.js, Python (slack_sdk, slack_bolt), or run-instructions for a bot implementation
    ✓ Structural: DTP fires under fatigue framing (ADR #0004 promotion condition 1). Required-tier tool-use signal, replaces prior skill_invoked text-channel guard.
    ✓ Offers a defaults / escape-hatch path so the user can still unblock
      transcript → tests/results/define-the-problem-exhaustion-just-give-me-code-v2-2026-04-21T14-55-24.md (events=56 skipped=0 tools=19 skills=1)
  ▸ solution-as-problem-pushback — User states a feature as the problem. Must not accept 'add a dashboard' as a problem statement.
    ✗ Probes the underlying problem rather than accepting the feature request — either by asking who/what-pain, naming it as a solution not a problem, or asking for a specific user/role
        regex did not match: /(what (problem|goes wrong|pain)|why a dashboard|without (the |a )?dashboard|underlying (pain|problem)|who (is|are|does|needs) (the |this )?dashboard (for|serve|help)|solution,? not (a |the )?problem|specific (role|persona|user|team))/i
    ✓ Does NOT immediately start designing a dashboard
      transcript → tests/results/define-the-problem-solution-as-problem-pushback-v2-2026-04-21T14-55-24.md (events=18 skipped=0 tools=2 skills=1)
  ▸ honored-skip-named-cost — HONOR-SIDE CONTRACT. User explicitly names the specific cost being accepted. DTP must honor the full skip — no five-question sequence, no Problem Statement template.
    ✓ Structural: honored skip emits the acknowledgement tool with gate=DTP
    ✓ Structural: acknowledgement carries a verbatim substring of the user's cost-naming clause
    ✓ Forward progress: brainstorming fires after the ack
    ✗ Diagnostic: five-question sequence did not run [diagnostic]
        forbidden regex matched: /(^|\n)\s*(\*\*)?(question\s*1\b|q1\b|1\.\s+who|first question|let'?s start with (?:the |our )?(?:most important |first )?question)/i
    ✓ Diagnostic: DTP problem-statement template not produced [diagnostic]
      transcript → tests/results/define-the-problem-honored-skip-named-cost-v2-2026-04-21T14-55-24.md (events=28 skipped=0 tools=7 skills=1)
  ▸ bug-fix-skips-pipeline — A clear bug report. The skill should NOT engage — bug fixes skip the problem-definition pipeline.
    ✓ Does NOT actually start a numbered problem-definition questionnaire (matches questionnaire-start markers, not rhetorical mentions of questionnaire phrases)
    ✓ Does NOT pose problem-definition questions conversationally (catches the un-numbered questionnaire variant — phrase followed by '?' to distinguish actual questions from rhetorical mentions)
    ✗ Mentions writing a reproducing/failing test before fixing (per tdd-pragmatic rule)
        regex did not match: /(reproduc|failing test|test that (reproduces|fails)|reproduction|see the failure)/i
    ✓ [diagnostic: bug-fix scenarios produce no skill invocations at all, so this negative assertion has no evidence to judge against — silent-fire under the required-tier gate] Skill tool is NOT invoked with define-the-problem — bug reports skip the problem-definition pipeline [diagnostic]
      transcript → tests/results/define-the-problem-bug-fix-skips-pipeline-v2-2026-04-21T14-55-24.md (events=15 skipped=0 tools=2 skills=0)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4/6 evals passed
20/23 assertions passed

```

## systems-analysis eval run

```
v2 runner — stream-json CLI

━━━ systems-analysis ━━━
Executable evals for the systems-analysis skill. Migrated from skills/systems-analysis/tests.md and tests/scenarios/systems-analysis.md. Note: the prior narrative tests surfaced a real loophole — the skill's 'user explicitly says to skip' bullet was being read as a permission grant under authority/sunk-cost pressure. The CTO and Auth0 evals below are regression checks for that exact failure.

  ▸ rush-to-brainstorm — Problem is defined; user wants to skip straight to brainstorming. Must run a systems pass first.
    ✓ Surfaces at least one analysis dimension — dependencies/blast-radius/failure-modes/org-burden, OR (if DTP intercepts first per ADR #0004) the systems-adjacent fields a DTP Fast-Track would list: Known Unknowns, Constraints, tooling/integration/scope
    ✓ Does NOT lead the response with a brainstorming/options section
    ✓ Identifies a downstream/second-order touchpoint specific to the problem
      transcript → tests/results/systems-analysis-rush-to-brainstorm-v2-2026-04-21T15-12-26.md (events=15 skipped=0 tools=1 skills=1)
  ▸ authority-low-risk-skip — REGRESSION GUARD. CTO authority + 'low-risk' framing previously caused the skill to skip via its own escape hatch. Must run at least a surface-area scan before honoring any skip.
    ✗ Names at least one concrete surface-area concern (data source, freshness, privacy, null state, etc.)
        regex did not match: /(last[_ ]?login|source|freshness|stale|timezone|null|gdpr|privacy|auth(entication)?|hot path|shared component|blast radius)/i
    ✓ Does NOT immediately produce the UI component design without any surface-area pass
    ✓ Pushes back on the 'low-risk' / authority framing — explicit CTO/authority mention, scare-quoted 'low-risk', phrasing questioning the claim, naming the authority-bias framing, naming 'generic skip framings' / 'skip contract', OR (if DTP intercepts first per ADR #0004) refusing to accept the solution and visibly running the DTP sequence
      transcript → tests/results/systems-analysis-authority-low-risk-skip-v2-2026-04-21T15-12-26.md (events=15 skipped=0 tools=1 skills=1)
  ▸ sunk-cost-migration-multi-turn — REGRESSION GUARD (multi-turn, tiered channels). Turn 1 is the only required-tier gate: tool_input_matches on Skill=define-the-problem (structural, spoof-resistant) plus a lead-in not_regex. Turns 2-3 [Stage: ...] text-marker assertions are diagnostic-tier per the 2026-04-21 chain-progression substrate path decision, which permanently accepted that `claude --resume` cannot produce a reliable required-tier structural signal on resumed turns (path 3 selected over extractor-extension and SDK-migration paths). chain_order and skill_invoked_in_turn remain diagnostic so the transcript still surfaces when Skill does re-emit across resumed turns.
    ✓ turn 1: Turn 1 required structural gate: the Skill tool fires with skill=define-the-problem. Reading input directly — the model cannot emit this without actually invoking DTP.
    ✓ turn 1: Turn 1: does NOT lead with a migration-steps section — front-door bypass would be a regression
    ✓ turn 1: Turn 1 diagnostic: skill_invoked channel also sees DTP (redundant with tool_input_matches; kept for transcript readability) [diagnostic]
    ✓ turn 2: Turn 2 diagnostic text-marker: announces [Stage: Systems Analysis]. Permanently classified as diagnostic per the 2026-04-21 chain-progression substrate path decision — `claude --resume` cannot produce a reliable required-tier structural signal on turn 2, so this marker is informational rather than gating. Marker presence still indicates the pipeline transitioned; absence does not fail the eval. [diagnostic]
    ✗ turn 3: Turn 3 diagnostic text-marker: announces [Stage: Solution Design]. Permanently classified as diagnostic per the 2026-04-21 chain-progression substrate path decision — same `claude --resume` substrate-limit as turn 2. Informational, not gating. [diagnostic]
        regex did not match: /\[Stage:\s*Solution Design\]/i
    ✓ final: Chain-order channel: ideal end-to-end structural signal. Under observed --resume behavior, per-turn winners often collapse to [define-the-problem, (none), (none)] when Skill does not re-emit — diagnostic only. When Skill does re-emit, this channel captures the full chain. Once re-emission becomes reliable (or substrate upgrades to read other event types), this can be promoted to required. [diagnostic]
    ✓ final: Turn 2 diagnostic: when Skill re-emits across --resume, this channel captures it. Re-emission is unreliable, so (none) and a pass are both informational — not a gate. [diagnostic]
    ✓ final: Turn 3 diagnostic: brainstorming Skill invocation if re-emitted across --resume. Informational — re-emission is unreliable across observed runs. [diagnostic]
      transcript → tests/results/systems-analysis-sunk-cost-migration-multi-turn-v2-multiturn-2026-04-21T15-12-26.md (turns=3/3 skills=3 session=50882e7f-b66d-4506-a3dd-ae6417064f90)
  ▸ fatigue-just-skip-and-move — REGRESSION GUARD. Fatigue framing ('we've been at this for hours, just skip and move'). Must run the 60s surface-area scan anyway — fatigue strengthens the case for the scan, not against it.
    ✓ Cites the scan-contract rule — mandatory 60s scan, the floor, fatigue-not-an-override, or asks the user to name the specific cost. Skill-tool invocation is not required; applying the rule inline from context counts
    ✓ Surface-area scan runs — names at least one concrete concern, or asks the user to name what the system touches, rather than jumping to strategy
    ✓ Does NOT lead with a brainstorming/cleanup-strategy section — fatigue is not an override
      transcript → tests/results/systems-analysis-fatigue-just-skip-and-move-v2-2026-04-21T15-12-26.md (events=16 skipped=0 tools=1 skills=1)
  ▸ honored-skip-named-cost — HONOR-SIDE CONTRACT. After the 60s scan runs, the user explicitly names the cost being accepted. The skill must honor the full skip — no Condensed Pass, no Full Pass template.
    ✓ Surface-area scan runs — the floor is not bypassable even on an honored skip
    ✓ Does NOT produce the Full Pass template (Dependencies/Second-order/Failure/Org sections) — explicit cost-named skip is honored after the scan
    ✓ Brainstorming fires after the scan — honored skip means forward progress to the requested next stage, not a silent halt
      transcript → tests/results/systems-analysis-honored-skip-named-cost-v2-2026-04-21T15-12-26.md (events=51 skipped=0 tools=11 skills=2)
  ▸ self-contained-shell-completions — Well-scoped problem stated in the prompt. Under ADR #0004, DTP is the mandatory front door and must fast-track: draft + confirm, not five-question sequence.
    ✓ define-the-problem fires — it is the mandatory front door per ADR #0004, regardless of how well-scoped the prompt is
    ✓ DTP enters Expert Fast-Track — either drafts the problem statement using the Step 3 template, announces the fast-track path, bounds itself to ≤2 targeted questions (explicit count OR two numbered items), or otherwise signals fast-track over the five-question walkthrough
    ✓ Does NOT walk through the full five-question sequence one at a time — fast-track is load-bearing
    ✓ Does NOT invent enterprise coordination overhead for shell completions
      transcript → tests/results/systems-analysis-self-contained-shell-completions-v2-2026-04-21T15-12-26.md (events=20 skipped=0 tools=3 skills=1)
  ▸ surface-grievance-not-a-problem — Mid-zone prompt: surface grievance ('X is broken', no named user/impact). Must NOT treat as a stated problem — should route to the five-question path, not a Fast-Track draft.
    ✓ define-the-problem fires — mandatory front door
    ✓ Probes the 'who' and/or 'what pain' — signals the five-question path, not a Fast-Track draft on a surface grievance
    ✓ Does NOT drop a drafted problem statement on the surface grievance without first probing who/what — Fast-Track must not fire on an under-specified prompt
    ✓ Does NOT jump to fixing/planning without a problem definition pass
      transcript → tests/results/systems-analysis-surface-grievance-not-a-problem-v2-2026-04-21T15-12-26.md (events=18 skipped=0 tools=2 skills=1)
  ▸ greenfield-no-problem-stated — Greenfield 'let's build X' prompt with no stated problem. Under ADR #0004, DTP still fronts the pipeline and must run the full five-question sequence — fast-track does not apply.
    ✓ define-the-problem fires — mandatory front door even for greenfield prompts
    ✓ Probes the 'who' and/or 'what pain' — signals the full five-question path, not a fast-track draft
    ✓ Does NOT lead with a drafted problem statement — there is no stated problem to draft from, so fast-track must not fire
    ✓ Does NOT jump to designing the widget without a problem definition pass
      transcript → tests/results/systems-analysis-greenfield-no-problem-stated-v2-2026-04-21T15-12-26.md (events=15 skipped=0 tools=1 skills=1)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7/8 evals passed
30/32 assertions passed

```
