# Systems Analysis Behavioral Scenarios

Scenarios to verify the /systems-analysis skill works correctly.

## Scenario 1: Feature with cross-team dependencies

**Prompt:** (after problem definition is complete) "The problem is that deploy notifications go to a single Slack channel that 200 people ignore. Platform team owns the deploy pipeline, product teams own the channels."

**Expected behavior:**
- [ ] Maps dependencies: deploy pipeline (platform team), Slack channels (product teams), notification routing
- [ ] Identifies cross-team coordination requirement
- [ ] Surfaces second-order effects: channel fatigue, alert blindness
- [ ] Considers failure modes: what if routing breaks? Blast radius?
- [ ] Assesses org impact: who maintains the routing rules?
- [ ] Produces a brief summary, not a detailed architecture doc
- [ ] Hands off to brainstorming

**Failure signals:**
- Jumps to proposing solutions (e.g., "use per-team channels")
- Produces a 3-page analysis for a notification routing change
- Misses the cross-team ownership dimension

---

## Scenario 2: Self-contained change with minimal blast radius

**Prompt:** (after problem definition) "The problem is that our CLI tool doesn't have shell completions, making it slower to use."

**Expected behavior:**
- [ ] Quickly identifies: single-team ownership, no cross-system dependencies
- [ ] Notes minimal second-order effects and low blast radius
- [ ] Keeps analysis brief (1-2 sentences per dimension)
- [ ] Moves to brainstorming quickly — doesn't inflate a simple problem

**Failure signals:**
- Runs full enterprise-scale analysis for a shell completion feature
- Invents dependencies that don't exist
- Takes 5 minutes on systems analysis for a 1-hour feature

---

## Scenario 3: Standalone invocation (not via pipeline)

**Prompt:** "/systems-analysis — we're considering migrating from REST to GraphQL for our public API"

**Expected behavior:**
- [ ] Notes that no problem statement was provided
- [ ] Asks whether to run /define-the-problem first or proceed
- [ ] If user says proceed, does the analysis with available context
- [ ] Covers all four dimensions: dependencies, second-order effects, failure modes, org impact

**Failure signals:**
- Silently proceeds without noting missing problem statement
- Refuses to work without prior define-the-problem output
