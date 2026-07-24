# correctness-adversary fixtures

Fixtures for the RED/GREEN proof in [`../REDGREEN.md`](../REDGREEN.md) (issue #494).
These agents only run via the swarm-spawn path (`hooks/adversarial-spawn.sh`, which
fires on `git diff HEAD`), so the "suite" is a committed fixture + a live proof record,
not an `eval-runner-v2.ts` suite (the runner cannot invoke a named agent).

## Files

| File | Role |
|---|---|
| `paginate.baseline.ts` | Correct code — committed as HEAD in the scratch repo. |
| `paginate.buggy.ts` | Baseline + a **planted off-by-one** (`pageNumber * pageSize`). The RED/discrimination diff. |
| `paginate.clean.ts` | Baseline + a **correct** `pageSize<=0` guard. The GREEN "no findings" control diff. |

## Discriminating signal (what #494 asks)

The planted defect is *purely* a logic bug (off-by-one / 1-index contract mismatch):
silent wrong output, no crash. It is deliberately **not** a security, perf, scope, or
test-gap issue. The claim under test: **correctness-adversary names this defect; the
four sibling workers do not.**

## Fire recipe (from a scratch repo OUTSIDE the claude-config tree)

```bash
scratch=$(mktemp -d)/paginate-fixture
mkdir -p "$scratch" && cd "$scratch"
git init -q && git config user.email t@t && git config user.name t
cp ~/repos/claude-config/agents/correctness-adversary/evals/fixtures/paginate.baseline.ts paginate.ts
git add paginate.ts && git commit -qm "baseline"
# apply the planted bug as an uncommitted working-tree change:
cp ~/repos/claude-config/agents/correctness-adversary/evals/fixtures/paginate.buggy.ts paginate.ts
hash=$(git diff HEAD | shasum -a 256 | awk '{print substr($1,1,16)}')
bash ~/repos/claude-config/hooks/adversarial-spawn.sh "$hash" manual-eval-run
# results:
cat .claude/state/critiques/*/correctness.md   # should name the off-by-one
cat .claude/state/critiques/*/SUMMARY.md        # arbiter should reference it
```

Run from the scratch repo, never from claude-config: the config repo self-triggers the
swarm and pollutes its own state.
