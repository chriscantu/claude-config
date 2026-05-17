# Fixtures: scope-tier-memory-check

Eval fixtures for `rules-evals/scope-tier-memory-check/evals/evals.json`.

## Fixture classes

### End-to-end fixtures (use `scratch_decoy`)

These fixtures exist as reference material for the eval entries. The actual
seeding is done via the `scratch_decoy` field in `evals.json` — the eval
substrate writes `.claude/settings.local.json` (hook registration) and
`.claude/projects/-Users-cantu-repos-claude-config/memory/MEMORY.md` (fixture
memory) into the scratch tmpdir before claude spawns.

**Why scratch_decoy instead of setup:** The `setup` field runs in the eval
runner's process cwd (repo root), not in the scratch tmpdir where claude
executes. Using `scratch_decoy` ensures the hook sees the fixture MEMORY.md
and settings when the claude process starts in its scratch dir.

**Hook path**: hardcoded to the worktree absolute path
(`/Users/cantu/repos/claude-config/.claude/worktrees/scope-tier-memory-check/hooks/scope-tier-memory-check.sh`).
Strategy B from the task spec — the runner doesn't export `HOOK_ABS_PATH`.
If the worktree path changes, update the `scratch_decoy` entries in evals.json.

**setup.sh files**: present in each end-to-end fixture subdir for documentation
and manual testing, but not used by the automated eval runner (superseded by
`scratch_decoy` approach). The setup.sh files demonstrate what state the hook
needs — useful for debugging or running fixtures manually against a real session.

| Fixture | Memory | Prompt key feature |
|---|---|---|
| `pr-330-canonical/` | scope-tier loaded | PR #330 shape: prune per-gate floor blocks |
| `pressure-framing-minimizer/` | scope-tier loaded | `just`, `small change` (minimizer — hook rejects) |
| `large-scope-keyword/` | scope-tier loaded | `rearchitect`, `refactor across` (scope-expander — hook rejects) |
| `no-matching-memory/` | non-scope-tier | clean mechanical (no matching memory — hook exits early) |
| `sentinel-bypass-active/` | scope-tier loaded | clean mechanical + `.claude/DISABLE_PRESSURE_FLOOR` seeded |
| `blast-radius-public-api/` | scope-tier loaded | `exported` + `api/` path (blast-radius — hook rejects) |
| `git-working-tree-large/` | scope-tier loaded | no git repo in scratch cwd — criterion 6 does not fire, match proceeds |

**Note on `git-working-tree-large`**: criterion 6 (git working-tree pre-check)
cannot be tested end-to-end via scratch_decoy because a git repo with in-flight
files cannot be seeded by the decoy mechanism. This eval instead documents the
graceful degradation path: when there is no git repo in the scratch cwd, the
hook's criterion 6 check passes (no rejection), and the match proceeds normally.
Criterion 6 unit coverage lives in `tests/hooks/scope-tier-memory-check.test.sh`.

### Routing-contract fixtures (use `additional_context`)

These fixtures have no `setup.sh`. The eval entry carries an `additional_context`
field — a synthetic `<system-reminder>` the substrate prepends to the prompt
envelope. This tests Layer 2 (rule routing) in isolation from Layer 1 (hook).

| Fixture | `additional_context` | Prompt key feature |
|---|---|---|
| `routing-contract-positive/` | SCOPE-TIER MATCH reminder | clean mechanical |
| `routing-contract-conflict-challenge/` | SCOPE-TIER MATCH reminder | `rename Foo across public SDK — breaks all consumers` |

### No-setup degradation fixture

| Fixture | Setup | `additional_context` | Purpose |
|---|---|---|---|
| `hook-not-installed/` | none | none | Documents graceful degradation: no reminder reaches model |

## Subdirectory listing (all 10)

- `pr-330-canonical/`
- `pressure-framing-minimizer/`
- `large-scope-keyword/`
- `no-matching-memory/`
- `sentinel-bypass-active/`
- `blast-radius-public-api/`
- `git-working-tree-large/`
- `routing-contract-positive/`
- `hook-not-installed/`
- `routing-contract-conflict-challenge/`

## File layout per end-to-end fixture

```
<fixture>/
  prompt.md           — user prompt under test (reference; embedded in evals.json)
  setup.sh            — manual-testing helper; NOT used by automated eval runner
  memory/
    MEMORY.md         — fixture memory index (reference; embedded in scratch_decoy)
```

Routing-contract and degradation fixtures contain only `prompt.md`.
