# Can Claude Code mods cut our token use? (2026-11-24)

**Decision: skip.** Do not adopt a public mod. Do not ship our own mod yet.

A mod is a TypeScript plugin that hooks into Claude Code itself. It can change
the system prompt, tool lists, reminders, and tool results. We tested whether
one can cut tokens without lowering eval pass rates. It cut input tokens by 16%.
It did not cut cost, and pass rates fell.

## Why

- Our best mod (`tool-diet`, code below) moves four rarely used tools behind
  ToolSearch. It cut input tokens by 16% per eval round (−15.7%).
- All of the saving was cache reads. Cache reads bill at 0.1x. Cache writes went
  up 11%, and they bill at 2x (1-hour cache). Net cost went **up** about 4%.
- Eval pass rate fell from 35/51 (69%) to 26/51 (51%). In 14 single-turn evals,
  the mod arm was worse in 7 and better in none (sign test p ≈ 0.016).
- Most of our other big spenders can already be cut without a mod: edit the
  rule files, turn off unused plugins, or compact sooner.

## Step 1: Baseline (last 30 sessions, 995 API calls)

Script: `tests/token-baseline.ts` (tests in `tests/token-baseline.test.ts`).

| Class | Tokens | Share |
|---|---:|---:|
| Fresh input | 2,248 | 0.0% |
| Cache write | 4,122,073 | 2.6% |
| Cache read | 155,901,089 | 97.0% |
| Output | 666,271 | 0.4% |

Cache-read ratio: 97.4% of input.

How a source is charged: its size, once for each API call it rides on. Sizes are
estimated at 4 characters per token, then scaled (×1.48) so the sum matches the
billed input.

| # | Source | Share of input | Cost-weighted share |
|---|---|---:|---:|
| 1 | Bash tool output | 19.4% | 17.6% |
| 2 | Assistant history (own past turns) | 18.3% | 17.1% |
| 3 | Built-in tool definitions | 14.9% | 16.1% |
| 4 | Always-loaded rules, CLAUDE.md, memory index | 11.8% | 12.9% |
| 5 | Read tool output | 10.3% | 11.1% |
| 6 | Other system reminders | 8.1% | 7.9% |
| 7 | Skill listing | 6.4% | 6.4% |
| 8 | Skill bodies | 2.4% | 2.1% |
| 9 | Harness system prompt | 2.0% | 2.6% |
| 10 | User prompts | 1.8% | 1.7% |
| — | Repeated file reads | 0.08% | — |

The Artifact tool's description alone is 29k characters. That is 45% of all
tool-definition bytes.

## Step 2: What a mod can reach

Source: the mod API types shipped with Claude Code 2.1.318 and the
`plugin-authoring` skill reference.

| Source | Mod can cut it? | API surface | Already handled without a mod? | Gap only a mod closes? |
|---|---|---|---|---|
| Bash output | Partly | `tool.call` result rewrite; `session.append` (`tool-result`) | Harness caps long output | Partly: trimming below the cap |
| Assistant history | No | `session.append` (`response`) exists, but rewriting the model's own turns is unsafe | `/compact`, auto-compact | No |
| Tool definitions | Yes | `tool.describe` → `description`, `isDeferred` | No. A deny rule removes the tool entirely | **Yes** |
| Rules / CLAUDE.md | Yes | `prompt.context` (`claudeMd` block, `instructionFiles`) | Yes: rules-reduction program (#554, #564), `hooks/rules-shadow.sh` loads a rule just in time | No |
| Read output | Partly | `tool.call` on Read | Read already skips unchanged re-reads (0.08%) | Partly: outlines for big files |
| System reminders | Yes | `prompt.attachment` → `{ text: null }` | Mostly: turn off unused plugins | Partly |
| Skill listing | Yes | `prompt.attachment` (`skill_listing`) | Yes: turn off unused plugins, shorten descriptions | No |
| Skill bodies | Yes | `skill.prompt` | Yes: edit SKILL.md (#555) | No |
| Harness system prompt | Yes | `prompt.section`, `prompt.compose` | No | Yes, but small (2%) and risky |
| User prompts | No | — | — | No |

Only one main spender is a true mod-only gap: tool definitions (14.9%).

## Step 3: Public mods

| Candidate | Maintainer | Last commit | Hooks / permissions | Code read? | Verdict |
|---|---|---|---|---|---|
| [claude-token-saver](https://github.com/4messiah/claude-token-saver) @ `4fcfab5` | 4messiah (1 star) | 2026-11-14 | Mod: `tool.call` on Bash/PowerShell/Read (rewrites output, denies reads), `session.compact`, `session.measure`; `$.fs.write` to save full output | Yes, `hooks/register.ts` in full | Reject: no license, so we can't legally reuse it. Its duplicate-read guard targets a 0.08% source. |
| [token-reducer](https://github.com/richard5mith/token-reducer) @ `9215ef0` | richard5mith (0 stars) | 2026-11-03 | Not a mod: classic PreToolUse shell hooks on Read and Bash; spawns `claude -p --model haiku` | Partly: `check-bash` and `SKILL.md` not read | Reject: not fully read, no license, and it sends file contents to a second model |
| claude-token-optimizer, tokenmiser, Madhan230205/token-reducer | — | — | CLI tools or indexers, not mods | No | Out of scope (not mods) |

No public mod defers tool definitions. GitHub code search for `isDeferred` plus
`tool.describe` found none.

## Step 4: Prototype and measurement

The mod defers Artifact, Workflow, ScheduleWakeup and ReportFindings. Each
stays callable through ToolSearch. A smoke test confirmed `ToolSearch
select:Artifact` and then a working Artifact call. The mod was not kept in the
repo. These three files rebuild it, so the test can be rerun. Put them in a
`tool-diet/` folder and pass that folder to `tests/mod-ab-run.ts` as `<modDir>`.

`tool-diet/.claude-plugin/plugin.json`:

```json
{ "name": "tool-diet", "version": "0.1.0", "description": "Moves rarely used built-in tools behind ToolSearch so their long descriptions stop riding on every request." }
```

`tool-diet/hooks/hooks.json`:

```json
{ "modules": ["./register.ts"] }
```

`tool-diet/hooks/register.ts`:

```ts
import type { Register } from 'claude-code'

const DEFERRED = ['Artifact', 'Workflow', 'ScheduleWakeup', 'ReportFindings']

export const register: Register = on => {
  for (const tool of DEFERRED) {
    on('tool.describe', { tool }, async ($, e, next) => ({ ...(await next(e)), isDeferred: true }))
  }
}
```

Smoke test, one-word prompt, steady state:

| Arm | Fresh | Cache write | Cache read | Total input |
|---|---:|---:|---:|---:|
| Off | 2 | 18,585 | 42,553 | 61,140 |
| On | 2 | 18,585 | 26,028 | 44,615 |

The first mod-on run read 0 tokens from cache. The stock request prefix is cached
across sessions; the mod's changed prefix starts cold.

A/B test: suites fat-marker-sketch (10), goal-driven (4), verification (3);
3 rounds per arm; arms alternate each round. Harness: `tests/mod-ab-run.ts`.

**One-off measurement.** The smoke test above and the A/B figures below were
measured once, on 2026-11-24. The harness printed its rows to the terminal, and
that output was not kept, so no script in this repo regenerates these exact
numbers. The cost-weighted line and the single-turn re-grade were worked out by
hand from those rows. Rerunning the harness with the rebuilt mod gives a new
sample, not these numbers.

**Deviation:** the eval config folder's login had expired, so both arms ran with
`EVAL_ALLOW_DEFAULT_CONFIG=1`, using the default config. Both arms share that
config, so the A/B difference holds. Absolute pass rates differ from the official
eval baseline.

Per round (all three suites):

| Arm | Round | Fresh | Cache write | Cache read | Output | Pass | Cache-read ratio |
|---|---|---:|---:|---:|---:|---:|---:|
| Off | 1 | 168 | 692,216 | 4,207,109 | 39,411 | 12/17 | 85.8% |
| Off | 2 | 142 | 688,103 | 3,570,654 | 48,608 | 13/17 | 83.8% |
| Off | 3 | 158 | 690,408 | 4,017,052 | 49,756 | 10/17 | 85.3% |
| On | 1 | 150 | 749,574 | 2,998,758 | 42,971 | 9/17 | 79.9% |
| On | 2 | 156 | 769,475 | 3,145,591 | 50,010 | 8/17 | 80.3% |
| On | 3 | 158 | 782,105 | 3,244,634 | 48,880 | 9/17 | 80.5% |

| Metric | Off (mean, range) | On (mean, range) | Change |
|---|---|---|---:|
| Input tokens per round | 4.62M (4.26–4.90M) | 3.90M (3.75–4.03M) | −15.7% |
| Cache write | 690k (688–692k) | 767k (750–782k) | +11.1% |
| Cache read | 3.93M (3.57–4.21M) | 3.13M (3.00–3.24M) | −20.4% |
| Output | 45.9k (39–50k) | 47.3k (43–50k) | +3.0% |
| Cost-weighted (write ×2, read ×0.1) | 1.77M | 1.85M | **+4.1%** |
| Pass rate | 35/51 (68.6%) | 26/51 (51.0%) | **−17.6 pts** |

Per suite:

| Suite | Off pass | On pass | Off input/run | On input/run |
|---|---:|---:|---:|---:|
| fat-marker-sketch | 20/30 | 16/30 | 2.85M | 2.56M |
| goal-driven | 7/12 | 4/12 | 1.48M | 1.17M |
| verification | 8/9 | 6/9 | 286k | 165k |

Single-turn evals, re-graded offline per arm (3 runs each):

| Eval | Off | On |
|---|---:|---:|
| fms / time-pressure-skip-sketch | 3/3 | 2/3 |
| fms / refactor-picks-before-after-archetype | 2/3 | 1/3 |
| fms / exhaustion-just-ascii-please | 1/3 | 0/3 |
| fms / pressure-floor-deadline-skip-sketch | 1/3 | 0/3 |
| goal-driven / plan-with-verify-checks-before-coding | 3/3 | 1/3 |
| goal-driven / skip-without-named-cost-still-emits-plan | 1/3 | 0/3 |
| verification / scope-creep-surfaces-before-result | 3/3 | 2/3 |
| 7 other evals | equal | equal |

Some failures hit evals that never touch the deferred tools. One example is
goal-driven's plan-format check. The cause is not proven. Text checks are
known to be flaky. Still, the direction never flipped.

## Step 5: Distribution

- Installs from this repo's marketplace into a brand-new config folder: **pass**
  (`claude plugin install tool-diet@leadership-toolkit`, status enabled).
- Loads in a fresh session there: **pass** (`tool-diet` in the session's plugin list).
- Fires for someone else: **not verified.** The fresh folder has no login, so no
  request went out, and a logged-out session lists none of the four tools. The
  mod fired in the logged-in default config only.
- After the decision, the mod and its marketplace entry were removed, so it does not ship.

## Trade-offs

- **Maintenance:** the mod API is marked early access and "may change between
  releases without notice." Each Claude Code update can break a mod silently.
- **Supply chain:** both public candidates have no license and 0–1 stars, and
  their authors could push new code at any time. Pinning by commit SHA limits
  that, but we would own any fixes.
- **Portability:** a mod changes the tool list for every project the user opens,
  not just this repo. Deferring Artifact also adds a ToolSearch round trip to
  each sketch.
- **Cache economics:** any change to the stock tool list loses the prefix cache
  shared across sessions. This is the hidden cost that turned a 16% token cut
  into a 4% cost rise.

## What would change the decision

- A rerun at 5 rounds per arm with the eval login restored, showing pass rates
  hold. The 3-round result can't rule out text-check noise.
- A billing model where cache reads, not cost, are the limit (for example,
  context-window pressure in long sessions). The 16k-token cut per request is real
  context space.

## Cheaper levers with no mod

Continue the rules-reduction program. Rules and instructions are 11.8% of input.

Turn off unused plugins. Script: `tests/plugin-usage.ts`. It scanned 931 saved
transcripts (since 2026-10-21; older ones are cleaned up automatically). That
count includes subagent transcripts, so it is more than the number of sessions.
Each plugin's size comes from the newest listing that still names it, so a
plugin turned off later still shows what it cost while it was on.

| Plugin | Times used | Est. raw tokens per request |
|---|---:|---:|
| engineering (synced) | 0 | ~700 |
| product-management (synced) | 0 | ~675 |
| design (synced) | 0 | ~500 |
| productivity (synced) | 0 | ~275 |
| cowork-plugin-management (synced) | 0 | ~180 |
| pr-review-toolkit | 14 sessions, 58 calls | ~1,660 |
| superpowers | 8 sessions, 14 calls | ~720 |

Turning off the five unused synced plugins saves about 2,300 raw tokens per
request. That is about 35% of the skill listing, or 2–3% of input. They sync from
the claude.ai account, so turning them off may also turn them off in claude.ai.
Their use there does not show up in these transcripts.
