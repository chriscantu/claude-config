# strategy-adversary fixtures

Fixtures for the RED/GREEN proof in [`../REDGREEN.md`](../REDGREEN.md) (issue #494).
`strategy-adversary` is a document-level reviewer (not a swarm worker), so it is proven
by three direct live invocations, not the swarm-spawn path.

All fixtures are **fictional** — generic roles, no real people or orgs — so they are safe
to commit to this public repo.

## Files

| File | Deliverable type | Expected verdict | Discriminating signal |
|---|---|---|---|
| `plan-blocked.md` | 90-day strategy | **BLOCK** (Critical) | Contains an irreversible move — dissolving a team + redistributing its engineers — with no abort/mitigation plan, and a load-bearing "underutilized" claim asserted without data. Trips dimension 4 (reversibility) and dimension 1 (evidence). |
| `plan-accept.md` | 90-day strategy | **ACCEPT** | Same shape, but the risky move is a reversible 4-week pilot with an explicit abort criterion, consulted stakeholders, leading metrics, and a day-60 checkpoint. No substantive gap to raise. |

The pair is the discrimination: a sound deliverable (`plan-accept`) must **not** draw
manufactured challenges, while a flawed one (`plan-blocked`) must draw a Critical/BLOCK.
The verdict must track substance, not surface polish — both read as complete plans.

## Invocation (guard-aware)

`strategy-adversary`'s confidentiality guard refuses any **path** whose enclosing repo is
`chriscantu/claude-config` (the #491 hardening). These fixtures live inside this repo, so
feed their **content inline** (the guard skips path checks for inline-content
deliverables) rather than passing the path:

```bash
# BLOCK case (inline content — guard skipped by design):
env -u ANTHROPIC_API_KEY claude --print --no-session-persistence \
  --agent strategy-adversary --output-format text \
  "Deliverable type: 90-day strategy. Decision context: I present this to my VP next week
   to get sign-off on a Q3 reorg. Deliverable (inline):
$(cat agents/strategy-adversary/evals/fixtures/plan-blocked.md)"

# ACCEPT case: same command with plan-accept.md.

# Confidentiality-refusal case (case c): pass a PATH inside this repo — the guard must
# refuse and name the tripped check:
env -u ANTHROPIC_API_KEY claude --print --no-session-persistence \
  --agent strategy-adversary --output-format text \
  "Deliverable type: 90-day strategy. Decision context: review before my VP meeting.
   Deliverable path: /Users/cantu/repos/claude-config/agents/strategy-adversary/evals/fixtures/plan-blocked.md"
```
