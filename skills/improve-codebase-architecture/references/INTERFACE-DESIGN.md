# Interface Design

When the user wants to explore alternative interfaces for a chosen deepening
candidate, use this parallel sub-agent pattern. Based on "Design It Twice"
(Ousterhout) — your first idea is unlikely to be the best.

Uses the vocabulary in [LANGUAGE.md](LANGUAGE.md) — **module**, **interface**,
**seam**, **adapter**, **leverage**.

> **Execution-mode note.** This pattern uses the Agent tool directly for
> *exploratory parallel dispatch* — divergent design exploration. Do NOT route
> through `superpowers:dispatching-parallel-agents`; that skill targets
> independent task *execution*, not divergent design *exploration*. Likewise,
> this pattern is NOT the per-task review loop in `rules/execution-mode.md` —
> the mode-announcement HARD-GATE applies to implementation plans
> (subagent-driven-development), not to design exploration. Spawning 3+ design
> agents here does not require the execution-mode announcement.

## Process

### 1. Frame the problem space

Before spawning sub-agents, write a user-facing explanation of the problem
space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see
  [DEEPENING.md](DEEPENING.md))
- A rough illustrative code sketch to ground the constraints — not a proposal,
  just a way to make the constraints concrete

Show this to the user, then immediately proceed to Step 2. The user reads and
thinks while the sub-agents work in parallel.

### 2. Spawn sub-agents

Spawn 3+ sub-agents in parallel using the Agent tool. Each must produce a
**radically different** interface for the deepened module.

Prompt each sub-agent with a separate technical brief (file paths, coupling
details, dependency category from [DEEPENING.md](DEEPENING.md), what sits
behind the seam). The brief is independent of the user-facing problem-space
explanation in Step 1. Give each agent a different design constraint:

- Agent 1: "Minimize the interface — aim for 1–3 entry points max. Maximise
  leverage per entry point."
- Agent 2: "Maximise flexibility — support many use cases and extension."
- Agent 3: "Optimise for the most common caller — make the default case
  trivial."
- Agent 4 (if applicable): "Design around ports & adapters for cross-seam
  dependencies."

**Anti-convergence directive.** Include in every sub-agent prompt verbatim:

> Your design must differ from the others on at least one of: seam placement,
> interface size (entry-point count), or dependency strategy. Naming
> differences alone do not count. If your honest reading of the constraints
> would yield the same shape as a peer's likely answer, push your design
> further along your assigned axis until it is defensibly worse on at least
> one trade-off than the alternatives.

Sub-agents are NOT given access to each other's outputs — divergence comes from
the assigned constraint, not from comparison.

Include both [LANGUAGE.md](LANGUAGE.md) vocabulary and `CONTEXT.md` vocabulary
(if present in the repo) in the brief so each sub-agent names things
consistently with the architecture language and the project's domain language.

Each sub-agent outputs:

1. Interface (types, methods, params — plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](DEEPENING.md))
5. Trade-offs — where leverage is high, where it's thin
6. **Defensibly worse on** — name the axis where this design is the weakest of
   the candidates and explain why that's acceptable for its assigned constraint.

### Tiebreaker for converged designs

If two sub-agents return near-identical designs (same seam, same entry-point
count, same dependency strategy), do NOT paper over the duplication in Step 3
prose. Re-spawn one agent with a sharper constraint (e.g. "your previous answer
matched another agent's seam placement — re-design with the seam at the
infrastructure boundary instead of the domain boundary"). Continue until the
3+ candidates differ on at least one structural axis each.

### 3. Present and compare

Present designs sequentially so the user can absorb each one, then compare
them in prose. Contrast by **depth** (leverage at the interface), **locality**
(where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is
strongest and why. If elements from different designs would combine well,
propose a hybrid. Be opinionated — the user wants a strong read, not a menu.
