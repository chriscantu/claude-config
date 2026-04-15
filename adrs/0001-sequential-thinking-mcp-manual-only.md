# ADR #0001: Adopt Sequential Thinking MCP as manual-only planning tool

Date: 2026-04-14

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

This project enforces a structured planning pipeline (`rules/planning.md`) that routes
all non-trivial work through problem definition, systems analysis, solution design, and
fat-marker sketching before implementation. The pipeline is effective for most work, but
large-scale architecture and refactoring decisions — particularly those with deep
trade-offs, many unknowns, or iterative revision — can stall in the solution design
stage without converging.

Sequential Thinking MCP is a Model Context Protocol server that provides explicit
stepwise reasoning with revision and branching capabilities. It was evaluated as a
potential augmentation to the existing planning pipeline.

### Forces in tension

- **Value of structured reasoning:** The existing pipeline already provides staged
  decomposition, checkpoint summaries, and forced trade-off analysis. Sequential
  Thinking MCP adds revision/branching within a single reasoning pass, which the
  current pipeline does not explicitly support.

- **Statefulness problem:** An earlier design explored automatic escalation from the
  local planning flow to Sequential Thinking based on counter-based triggers
  (backtrack count, iteration count, decision reopen count). This was rejected because
  Claude Code skills and rules are stateless text instructions — there is no persistent
  state machine across messages. Precise counter tracking would be unreliable, making
  the triggers fire at wrong times or not at all.

- **Semantic detection (deferred):** A semantic approach — detecting reasoning quality
  rather than counting iterations — was identified as more viable but requires observed
  usage patterns to design effective heuristics. We have no personal failure cases in
  this project yet to ground the design.

- **Integration overhead:** Adding an MCP server introduces a dependency, onboarding
  friction, and maintenance cost. This is only justified if the tool delivers clear
  value over what the model's native extended thinking already provides with
  well-structured prompts.

- **User control and transparency:** Any escalation to a different reasoning mode must
  be user-initiated and clearly announced. Automatic invocation without consent was
  ruled out as a design constraint.

## Decision

We will adopt Sequential Thinking MCP as a **manual-only, opt-in tool** available
during planning stages (Phase 1). Specifically:

1. **Manual invocation only.** Users explicitly request a sequential thinking pass when
   they feel the planning process is not converging. No automatic triggers.

2. **Bounded execution.** Each pass is constrained: max 8 thought steps (extendable to
   12 with explicit approval), max 1 branch, ~10 minute timebox.

3. **Structured output.** Each pass returns: top options (max 3), recommended option
   with rationale, key risks/unknowns, validation plan, and next 3 concrete actions.

4. **Transparency.** The system announces when a sequential thinking pass starts and
   ends, and returns to normal planning flow afterward.

5. **Data gathering.** Phase 1 is explicitly a learning period. We will track when and
   why the tool is invoked to inform future automation decisions.

We will **not** build:
- Automatic escalation triggers (counter-based or semantic)
- State machine or cooldown logic
- Mandatory usage for any task category

Future phases (tracked in GitHub issues):
- **Phase 2:** Design semantic trigger heuristics based on observed manual usage
  patterns — what signals preceded manual invocation?
- **Phase 3:** Implement semi-automatic escalation offers with validated triggers,
  preserving user consent and transparency.

## Consequences

**Positive:**
- Low integration overhead — minimal config changes, no new skills to maintain yet
- No risk of false-positive triggers interrupting planning flow
- Preserves user control and transparency as hard constraints
- Generates real usage data to inform future automation design
- Existing planning pipeline remains unchanged and primary

**Negative:**
- Value depends entirely on user remembering the tool exists and choosing to invoke it
- No data collection mechanism is built in — tracking usage patterns is manual
- Phase 2/3 may never happen if the tool proves unnecessary in practice

**Neutral:**
- Adds one MCP server dependency to the project configuration
- Does not change any existing skill or rule behavior
