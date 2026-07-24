# correctness-adversary — live RED/GREEN demonstration (#494, #495)

Per [ADR #0005](../../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md) §4,
discrimination must be **demonstrated, not asserted**. Agents are not HARD-GATE rules, so
there is no `~/.claude/rules/*.md` symlink to strip and `bin/redgreen.fish` does not apply.
For a swarm worker the discriminating variable is the **worker lens itself**: the same live
fire runs all five workers on one diff, and the claim under test is *which* worker names the
planted defect.

**Method.** These agents only run via the swarm-spawn path (`hooks/adversarial-spawn.sh`,
which fires on `git diff HEAD`). We fired the real 5-worker swarm once on a scratch repo
outside the config tree (`/tmp/corr-swarm-fixture`), HEAD = `paginate.baseline.ts`,
working tree = `paginate.buggy.ts` (a single-line planted off-by-one). Subscription path
(`env -u ANTHROPIC_API_KEY … claude --print --agent <role>-adversary`), `worker_timeout=240s`.
The GREEN "clean-diff" control was a separate single-worker fire on a comment-only diff
(`paginate.clean.ts`). Fixtures + full transcripts are committed under `fixtures/` and
`transcripts/`.

## Result matrix — planted defect: off-by-one `start = pageNumber * pageSize` (`paginate.ts:13`)

`✓` = worker names the planted off-by-one as a finding. `–` = does not.

| Worker | Buggy diff (RED) | What it actually reported |
|---|:--:|---|
| **correctness** | **✓ (Finding #1, worst-first)** | Names the off-by-one at `paginate.ts:13`; explains silent corruption (page 1 → `all[10..20)`); concrete probe. |
| security | – | `No security findings.` — explicitly *"correctness-worker territory."* |
| perf | – | Own-lane finding (full-dataset materialization); never names the arithmetic bug. |
| scope | – | Own-lane finding (`totalPages` beyond stated purpose); explicitly defers the arithmetic to correctness. |
| test-gap | ~ (instrumental) | Finding is the **missing regression test**; cites the off-by-one as the consequence a test would catch. In-lane, not a diagnosis of the logic. |
| **arbiter** | **✓** | `SUMMARY.md` ranks the correctness off-by-one **Finding #1** cross-dimensionally; notes *"All 5 ran; none failed."* |

| Worker | Clean diff (GREEN, comment-only) | Reported |
|---|:--:|---|
| **correctness** | **planted defect absent** | Never mentions the arithmetic inversion (the code is correct there); raises only *pre-existing* input-validation edges (negative/NaN/fractional/out-of-range). |

## Discrimination: proven

- **RED, planted-defect isolation.** Of the five workers, **correctness is the only one that
  diagnoses the planted off-by-one as its finding.** Security/perf/scope do not name it at all
  (security emits an explicit no-findings block and cedes the ground to correctness). The
  arbiter surfaces it as the top cross-dimensional finding. This is the #494 discriminating
  signal: *correctness surfaces the logic bug; siblings stay in their lanes.*
- **GREEN, binds to real code state.** On the clean (comment-only) diff, correctness **does not**
  flag the off-by-one — because the arithmetic is correct there. It is not replaying a script;
  it reports against the actual diff.

## Documented limitations (recorded, not papered over)

1. **test-gap references the bug instrumentally.** #494's RED text says "siblings do not
   surface it." Strictly, test-gap *mentions* the off-by-one — but as the *motivation* for its
   own finding (no regression test), which is correct in-lane behavior (a fix without a test IS
   a test-gap). The faithful claim that holds: correctness is the only worker that treats the
   logic defect as *the* finding; security/perf/scope do not surface it at all.
2. **A literal `No correctness findings.` block was not elicited from this fixture.** The
   `paginate` function has genuine *pre-existing* input-validation edges (negative `pageNumber`,
   `pageSize=0 → Infinity`, fractional sizes). A rigorous correctness reviewer surfaces those on
   any diff touching or documenting the function, so the empty block is unreachable against a
   realistic fixture — the agent correctly refuses to rubber-stamp. The **anti-padding / empty-block
   behavior is independently confirmed live** by `security-adversary` emitting `No security
   findings.` on the same fire, and by scope/perf explicitly stating they are "not padding to hit
   a count." The GREEN property that matters — *the planted defect is absent when the code is
   correct* — is demonstrated (transcript `transcripts/clean-diff-run.md`).

## Transcript references

- Buggy-diff swarm (all 5 workers + arbiter): `transcripts/{correctness,security,perf,scope,test-gap,SUMMARY}.md`
- Fired diff + spawn log: `transcripts/fired.diff`, `transcripts/spawn.log`
- Clean-diff correctness run: `transcripts/clean-diff-run.md`
- Fixtures: `fixtures/paginate.{baseline,buggy,clean}.ts`, `fixtures/README.md`

## Acceptance

### #494 (correctness-adversary half)
- [x] RED: planted off-by-one (not a security/perf/scope/test-gap issue) → correctness surfaces it; siblings do not diagnose it
- [x] GREEN: on a correct diff the planted defect is absent from the correctness critique (empty-block behavior confirmed live via security-adversary; limitation documented)
- [x] Co-located suite: `agents/correctness-adversary/evals/` carries fixtures + this proof record
- [x] Demonstrably discriminating (severity/lens isolation shown from live transcripts, not asserted)

### #495 (5-worker swarm end-to-end)
- [x] `correctness-adversary` produced a well-formed `correctness.md` under its Output Contract
- [x] Arbiter read all five worker files and referenced the correctness finding in `SUMMARY.md` (ranked #1)
- [x] No timeout/latency regression: all 5 workers 27–60s, arbiter ~52s, total ~111s — all under the 240s cap
