# Planning Pipeline Behavioral Scenarios

Scenarios to verify Claude follows the planning pipeline correctly.
Run manually or via `claude --print` to check behavior.

## Scenario 1: New feature triggers full pipeline

**Prompt:** "Let's build a notification system for overdue tasks"

**Expected behavior:**
- [ ] Invokes `/define-the-problem` (or announces problem definition stage)
- [ ] Asks about who has the problem (specific persona)
- [ ] Asks about observable pain (not accepting solution-as-pain)
- [ ] Asks behavioral/emotional follow-up before moving to evidence
- [ ] Does NOT propose solutions before completing problem definition
- [ ] Transitions to `/systems-analysis` after problem statement
- [ ] Transitions to brainstorming after systems analysis
- [ ] Produces fat-marker sketch after approach is selected

**Failure signals:**
- Immediately proposes architecture or technology choices
- Skips straight to "here's how I'd build it"
- Asks all questions at once instead of incrementally

---

## Scenario 2: Expert fast-track activates

**Prompt:** "We need to add a `/standup` command to the eisenhower plugin. The problem is that engineering leads spend 15+ minutes each morning manually checking Slack, calendar, and Jira to prep for standup. I've timed it — it takes me 12-18 minutes daily. No technical constraints beyond the existing plugin architecture."

**Expected behavior:**
- [ ] Recognizes that persona, pain, evidence, and constraints are already provided
- [ ] Says something like "You've already covered problem definition"
- [ ] Validates understanding with a 1-sentence summary
- [ ] Picks up at systems analysis (not re-asking problem questions)

**Failure signals:**
- Re-asks "who has this problem?" when it's clearly stated
- Starts from question 1 of define-the-problem despite complete context
- Skips systems analysis entirely

---

## Scenario 3: Solution-as-problem pushback

**Prompt:** "I want to add a dashboard"

**Expected behavior:**
- [ ] Pushes back — asks what goes wrong without the dashboard
- [ ] Does NOT accept "dashboard" as the problem statement
- [ ] Probes for the underlying pain

**Failure signals:**
- Accepts "add a dashboard" at face value and starts designing
- Asks only "what should the dashboard show?" instead of "what problem does it solve?"

---

## Scenario 4: Bug fix skips pipeline

**Prompt:** "The test suite fails when running on CI because of a timezone issue in the date formatter"

**Expected behavior:**
- [ ] Does NOT invoke the full planning pipeline
- [ ] Goes straight to investigation/fix
- [ ] Writes a reproducing test before fixing (per tdd-pragmatic rule)

**Failure signals:**
- Asks "who has this problem?" for a clear bug report
- Runs the full planning pipeline for an obvious fix

---

## Scenario 5: User requests skip

**Prompt:** "Skip the planning stuff, just build me a simple config parser in TypeScript"

**Expected behavior:**
- [ ] Respects the skip request
- [ ] May briefly note what was skipped
- [ ] Proceeds to implementation
- [ ] Still follows TDD and verification rules (those aren't skippable)

**Failure signals:**
- Ignores user and runs full pipeline anyway
- Skips TDD/verification along with planning
