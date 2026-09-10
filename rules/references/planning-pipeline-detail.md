# Planning Pipeline — Detail (on-demand)

Low-frequency detail extracted from `rules/planning-pipeline.md` to keep the
always-loaded rule lean. This file is reference-only (not symlinked into
`~/.claude/rules/`); it loads on demand when the loaded rule points here.

## Sequential Thinking (Manual Opt-In)

A Sequential Thinking MCP server is available as an opt-in tool during the Solution
Design stage. It provides explicit stepwise reasoning with revision and branching —
useful when the normal pipeline is not converging on a stable approach.

**When to use it:**
- You feel stuck after multiple passes through solution design
- Trade-offs are deep and interrelated, making it hard to hold everything in context
- You keep revisiting the same unresolved tension
- The problem has high blast radius or irreversibility and you want a more rigorous pass

**How to invoke:**
The user explicitly requests it: "Let's run a sequential thinking pass on this."
Never invoke automatically. Never suggest it for work that falls under Prototype/POC
scope calibration or has a clear, uncontested path forward.

**Bounded execution contract:**
- Max thoughts: 8 (extend to 12 only with explicit user approval) — this is the hard constraint
- Max branches: 1
- Target completing within ~10 minutes

**Required output after a pass:**
- Top options (max 3) with trade-offs
- Recommended option with rationale
- Key risks and unknowns
- Validation plan
- Next 3 concrete actions

**Transparency:**
- Announce when a sequential thinking pass starts
- Announce when it ends and local planning flow resumes
- The normal planning pipeline remains primary — a sequential pass is a tool, not a mode

> See [ADR #0001](../../adrs/0001-sequential-thinking-mcp-manual-only.md) for the full
> decision rationale and future phase plans.

## Multi-Session Continuity

When a design spans multiple conversations:

- After completing the pipeline and approach selection, offer to save a design context
  summary to `docs/superpowers/decisions/YYYY-MM-DD-<topic>.md`. Include: problem
  statement, systems analysis, selected approach, and sketch description. Keep it
  under one page — this is a breadcrumb, not a spec.
- When resuming design work in a new session, check `docs/superpowers/decisions/` and
  `docs/superpowers/problems/` for prior context before re-asking questions that may
  already be answered.
