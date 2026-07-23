# Operations

Runtime controls for the safety rails this config installs. For the catalog of what those rails are, see [catalog.md](catalog.md).

## Runtime Bypass Flags

The `planning` rule enforces a **pressure-framing floor**: when Claude detects deadline pressure, authority invocations, or fatigue framings (*"ship by Friday"*, *"my VP approved this"*, *"I'm tired — just give me code"*), it routes to `/define-the-problem` rather than honoring a skip request. These are exactly the moments the planning pipeline is most valuable.

If the floor misfires for your workflow — for example, you're running a demo, or the rule is catching a framing it shouldn't — you can disable it at runtime with a sentinel file.

> **Bug vs. bypass.** If the misfire is reproducible and not specific to your local workflow (same prompt routes to DTP across fresh sessions), that's a bug — file an issue with a reproduction rather than leaving the bypass on. The bypass is a runtime rollback, not a silent alternative to fixing the rule.

### Disabling the pressure-framing floor

Create an empty file at either location (project-scoped is checked first):

```sh
# Project-scoped
touch .claude/DISABLE_PRESSURE_FLOOR

# Or global
touch ~/.claude/DISABLE_PRESSURE_FLOOR
```

File existence alone triggers the bypass — content is ignored.

On the first pressure-framed prompt after the bypass takes effect, Claude prints a visible banner identifying the bypass and the restore command. The banner is intentional — the bypass is never silent. Exact banner wording is defined in [`rules/pressure-framing-floor.md`](../rules/pressure-framing-floor.md) under the emergency-bypass block; if you need to match on it programmatically, read the rule file rather than copy-pasting from here.

**Restoring the floor:**

```sh
rm ~/.claude/DISABLE_PRESSURE_FLOOR      # or .claude/DISABLE_PRESSURE_FLOOR
```

**Verifying current state:**

```sh
ls ~/.claude/DISABLE_PRESSURE_FLOOR .claude/DISABLE_PRESSURE_FLOOR 2>/dev/null
```

No output means no sentinel file exists and the floor is active. One or two path lines means the bypass is on.

### What the bypass does NOT affect

- **Named-cost skips** still work exactly as before. Phrasings like *"skip DTP, I accept the risk of building on an unstated problem"* continue to honor the skip regardless of bypass state.
- **Non-pressure-framed prompts** are unaffected. The floor only fires on pressure framings; routine work routes normally.
- **Other planning stages** (systems-analysis, sketch, brainstorming) are unchanged.

### Caveat

Leaving the flag on permanently defeats the floor entirely — you lose the guardrail against Claude honoring a premature skip under pressure. Prefer fixing the underlying regression (open an issue with a reproduction) over making the bypass permanent.

## Git Guardrails Hook (opt-in)

A `PreToolUse` hook at [`hooks/block-dangerous-git.sh`](../hooks/block-dangerous-git.sh) blocks destructive git operations at the harness layer — not by asking Claude nicely, but by exiting with code 2 before the command runs. Adapted from [mattpocock/skills `git-guardrails-claude-code`](https://github.com/mattpocock/skills/tree/main/git-guardrails-claude-code) with a narrower blocklist that targets actually-destructive operations and `CLAUDE.md`-forbidden flags, leaving normal `git push` / `git commit` alone.

### What gets blocked

| Pattern | Why |
|---|---|
| `git push --force` / `-f` / `--force-with-lease` to `main`/`master` | Force-pushing the trunk overwrites shared history. |
| `git commit --no-verify`, `git rebase --no-verify`, `git push --no-verify` | Skipping pre-commit / pre-push hooks bypasses safety checks. |
| `--no-gpg-sign` | Bypasses commit signing where required. |
| `git reset --hard` | Discards uncommitted work irreversibly. |
| `git clean -f` / `git clean -fd` | Deletes untracked files. |
| `git branch -D` | Force-deletes a branch (vs `-d` which only deletes if merged). |
| `git checkout .` / `git restore .` | Wipes uncommitted changes wholesale. |

Force-pushing to a feature branch is **allowed**. Routine `git push` and `git commit` are **allowed**.

### Install

The hook script is symlinked into `~/.claude/hooks/block-dangerous-git.sh` automatically by `bin/link-config.fish`. Wire it into the harness by adding this to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "~/.claude/hooks/block-dangerous-git.sh" }
        ]
      }
    ]
  }
}
```

If `hooks.PreToolUse` already exists, **merge** into the existing array rather than replacing.

### Verify

```sh
bash tests/hooks/block-dangerous-git.test.sh   # smoke tests against the script
echo '{"tool_input":{"command":"git push --force origin main"}}' \
  | ~/.claude/hooks/block-dangerous-git.sh   # should exit 2 with BLOCKED message
```

### Disable

Create an empty sentinel file (mirrors the `DISABLE_PRESSURE_FLOOR` pattern):

```sh
touch ~/.claude/DISABLE_GIT_GUARDRAILS    # global
touch .claude/DISABLE_GIT_GUARDRAILS      # project-scoped (checked first)
```

Delete the file to restore. Existence alone disables; content ignored.

### Customizing the blocklist

Edit `hooks/block-dangerous-git.sh` and adjust `DANGEROUS_PATTERNS`. Patterns are extended-regex (`grep -E`). Re-run `bash tests/hooks/block-dangerous-git.test.sh` after editing to confirm fixtures still pass.

## Scope-Tier Memory Check Hook (opt-in)

A `UserPromptSubmit` hook at [`hooks/scope-tier-memory-check.sh`](../hooks/scope-tier-memory-check.sh) injects scope-tier context into the session before each prompt is processed. It detects verb signals (e.g. "add row to", "update entry in"), minimizers (e.g. "small change"), scope-expanders (e.g. "cross-cutting change", "refactor across"), and blast-radius words (e.g. "public API", "breaking change") to help the planning pipeline calibrate tier selection correctly.

The hook is disabled when `~/.claude/DISABLE_PRESSURE_FLOOR` or `.claude/DISABLE_PRESSURE_FLOOR` is present — same sentinel file as the pressure-framing floor.

Full spec: [`docs/superpowers/specs/2026-05-17-scope-tier-memory-check-design.md`](superpowers/specs/2026-05-17-scope-tier-memory-check-design.md).

### Install

```sh
fish bin/link-config.fish
fish bin/install-scope-tier-hook.fish
```

`bin/link-config.fish` creates `~/.claude/hooks/scope-tier-memory-check.sh` (the symlink that `validate.fish` checks for). Run it first on a fresh clone or after adding new hook files. It is idempotent.

`bin/install-scope-tier-hook.fish` adds a `UserPromptSubmit` entry to `~/.claude/settings.json` pointing at the hook. It is idempotent — safe to re-run.

### Verify

```sh
fish bin/install-scope-tier-hook.fish --check
bash tests/hooks/scope-tier-memory-check.test.sh
```

### Remove

```sh
fish bin/install-scope-tier-hook.fish --remove
```

## Adversarial Code Review Swarm (opt-in)

A `PostToolUse` hook at [`hooks/adversarial-trigger.sh`](../hooks/adversarial-trigger.sh) fires on `Write|Edit|MultiEdit` tool results and threshold-gates a backgrounded **swarm** red-team critique of the current `git diff HEAD`. Four specialized adversaries fan out in parallel, then an arbiter synthesizes a single ranked summary. Intended for ongoing development work where you want adversarial review without a PR or CI/CD round-trip.

### Swarm topology

| Role | Agent | Lens |
|---|---|---|
| Coordinator | `hooks/adversarial-spawn.sh` (shell, no LLM) | parallel dispatch + arbiter sequencing |
| Worker 1 | [`security-adversary`](../agents/security-adversary.md) | OWASP, secrets, authz, input validation, deps |
| Worker 2 | [`perf-adversary`](../agents/perf-adversary.md) | Big-O, N+1, allocations, blocking I/O |
| Worker 3 | [`scope-adversary`](../agents/scope-adversary.md) | Karpathy #3 — surgical scope, dead code, drift |
| Worker 4 | [`test-gap-adversary`](../agents/test-gap-adversary.md) | missing coverage, brittle assertions, regression tests |
| Worker 5 | [`correctness-adversary`](../agents/correctness-adversary.md) | logic bugs — off-by-one, null/empty, error paths, branch logic, races, contract mismatch |
| Synthesis | [`arbiter`](../agents/arbiter.md) | dedupe, cross-rank, top-N consolidated SUMMARY |

Shell coordinator instead of LLM-queen — at 5 workers, hierarchical queen pays no quality premium. Above ~10 workers, reconsider.

### What it does

1. Computes diff stats vs `HEAD` (LOC delta, file count, hard-gate path hits).
2. Fires only when one of the thresholds in [`hooks/adversarial-config.json`](../hooks/adversarial-config.json) trips: `loc_threshold` (default 100), `file_threshold` (default 3), or a path matching `hard_gate_paths` (default: `rules/`, `adrs/`, `skills/.*/SKILL.md`, `Plans.md`).
3. Debounces by diff hash + a `debounce_seconds` window (default 30s) so a single editing burst spawns one swarm fire, not one per keystroke.
4. Captures `git diff HEAD` once into `<sha-dir>/.diff-captured` then spawns the worker `claude --print` invocations (default five) in parallel (each `--agent <role>-adversary`).
5. Waits for all workers, then spawns the arbiter to read the worker outputs and emit a synthesized `SUMMARY.md`.
6. After arbiter completes, the coordinator extracts the top-2 finding titles from `SUMMARY.md` and stores them to claude-flow shared memory (`adversarial-patterns` namespace) for cross-session pattern learning. Failure is non-blocking.
7. Output lands at `.claude/state/critiques/<branch>-<sha>-<diff-hash>/{security,perf,scope,test-gap,correctness,SUMMARY}.md`.
8. `.claude/state/` is gitignored, so critiques never land in commits.

### Auth

`claude --print` is invoked under `env -u ANTHROPIC_API_KEY` so it falls back to keychain OAuth (Max plan), not API-key billing. With `ANTHROPIC_API_KEY` set in the environment, `claude --print` would otherwise bill against the API key — typically zero credit for Max subscribers.

### Disable

The hook is disabled when `~/.claude/DISABLE_ADVERSARIAL` or `.claude/DISABLE_ADVERSARIAL` is present (file existence triggers bypass; content ignored). Same pattern as the pressure-floor sentinel.

```sh
touch .claude/DISABLE_ADVERSARIAL    # project-local off-switch
rm .claude/DISABLE_ADVERSARIAL       # re-enable
```

### Status line

[`hooks/adversarial-status.sh`](../hooks/adversarial-status.sh) prints `[N critiques pending]` when one or more `*.md` files exist under `.claude/state/critiques/`. Wire it into your status line in `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "bash ${CLAUDE_PROJECT_DIR}/hooks/adversarial-status.sh"
}
```

### Install

```sh
fish bin/link-config.fish    # symlinks all 5 swarm agents into ~/.claude/agents/
```

The `PostToolUse` hook entry already lives in `.claude/settings.json` under the `Write|Edit|MultiEdit` matcher (second hook in the list — first is the existing post-edit handler).

### Tuning

Edit `hooks/adversarial-config.json` to adjust thresholds. Setting `loc_threshold` and `file_threshold` higher means fewer fires; adding entries to `hard_gate_paths` (regexes, anchored as needed) forces a fire whenever those paths change regardless of size. The `workers` array can be trimmed if you only want a subset of lenses (e.g. drop `perf` for a frontend-config-only repo).

### Cost expectations

Each swarm fire spawns 5 `claude --print` invocations (4 workers + 1 arbiter). On the default OAuth/Max plan auth path, this counts against your subscription usage. Threshold defaults (100 LOC / 3 files / hard-gate paths) are sized to fire ~once per substantive edit burst, not per keystroke. Audit fire frequency in `.claude/state/critiques/.spawn-log`.

### Read the critiques

```sh
ls .claude/state/critiques/                          # see pending swarm dirs
cat .claude/state/critiques/*/SUMMARY.md             # read consolidated summaries
cat .claude/state/critiques/<dir>/{security,perf,scope,test-gap}.md  # individual worker outputs
rm -rf .claude/state/critiques/*                     # clear when done (or just leave them — gitignored)
```

## Behavioral Evals in CI (scheduled)

The structural checks (`validate.fish`, `bun test`) and the sycophancy classifier run
per-PR and are free — none of them call the model. The **live** behavioral eval suite
(the runner shells `claude --print`) is different: it exercises whether Claude actually
follows the HARD-GATEs. It runs on a schedule, not per-PR, via
[`.github/workflows/behavioral-evals.yml`](../.github/workflows/behavioral-evals.yml).

### Auth & billing — no separate API fee

The workflow authenticates with `CLAUDE_CODE_OAUTH_TOKEN`, so runs draw on the Max
subscription rather than metered API billing. It deliberately does **not** set
`ANTHROPIC_API_KEY` (it would take precedence → pay-per-token) and does **not** pass
`--bare` (bare mode ignores the OAuth token).

> **Usage-window caveat.** "No fee" is not "no cost." Subscription runs consume the
> shared Max usage limits (rolling 5-hour + weekly windows) — the same pool as your
> interactive Claude Code and chat use. This is why the job is scheduled + scoped to a
> bounded rule-suite subset, not run per-PR on the full 198-eval suite.

### One-time setup

```sh
claude setup-token          # generates a one-year OAuth token (requires Pro/Max/Team/Enterprise)
```

Add the printed token as a repository secret named `CLAUDE_CODE_OAUTH_TOKEN`
(`gh secret set CLAUDE_CODE_OAUTH_TOKEN`, or Settings → Secrets and variables → Actions).
Without it, the job's guard step fails loud with a setup pointer.

### What runs

- **Schedule:** weekly (Mondays 08:17 UTC). **Manual:** `workflow_dispatch` with an
  optional `suites` input (space-separated) to override the default set.
- **Default subset:** the HARD-GATE rule suites, run one-per-invocation (the runner
  filters to one suite per call) with `--concurrency 1 --text-nonblocking` so only the
  reliable *structural* axis gates. `pr-validation` is **excluded** from the default
  because it has a known-failing required-structural eval (see
  [`tests/EVAL_BASELINE.md`](../tests/EVAL_BASELINE.md)); add it via the dispatch input
  once that baseline is cleared, so "red = real regression" holds.

### Discrimination proofs (RED/GREEN)

The companion to running evals is proving each rule actually *discriminates* behavior
(ADR #0005 §4). See [`rules-evals/REDGREEN-RUNBOOK.md`](../rules-evals/REDGREEN-RUNBOOK.md)
and the harness [`bin/redgreen.fish`](../bin/redgreen.fish). Live proofs consume the same
Max usage window and briefly strip a rule from `~/.claude` — don't run concurrent
interactive sessions during one.

## Log Hygiene

### `excalidraw.log` rotation

The excalidraw MCP server writes to `excalidraw.log` in the repo root and
does not rotate the file itself. It is `.gitignore`d so it never lands in
commits, but it can grow indefinitely on disk (observed at 8.6MB after a
few weeks of canvas use). [`bin/rotate-excalidraw-log.fish`](../bin/rotate-excalidraw-log.fish)
rotates the file when it crosses a size threshold:

```sh
fish bin/rotate-excalidraw-log.fish              # default: 10MB cap, 1MB tail kept
fish bin/rotate-excalidraw-log.fish --threshold-mb 25 --keep-tail-mb 5
```

When the log exceeds the threshold, the script keeps a tail of recent
entries at `excalidraw.log.1` (also `.gitignore`d via the same wildcard)
and truncates the active log. Idempotent — safe to invoke from a
SessionStart hook, cron, or manually. Exits 0 silently when the log
doesn't exist or is under the threshold.

To run on every session start, add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          { "type": "command", "command": "fish /Users/<you>/repos/claude-config/bin/rotate-excalidraw-log.fish", "timeout": 5 }
        ]
      }
    ]
  }
}
```

### Plans.md drift

The `claude-code-harness:harness-progress` skill scans `Plans.md` for
per-issue `cc:WIP` / `cc:TODO` / `cc:完了` status markers and flags
"drift" when markers go stale relative to GitHub issue state. This repo
declares GH issues as SSOT (see `Plans.md` preamble) and intentionally
does NOT carry per-issue markers — so the drift detector's heuristic
produces a false positive every session start.

Resolution: `Plans.md` line 16 is worded so the harness regex does not
match (no literal `cc:WIP` / `cc:TODO` / `cc:完了` tokens). The detector
reports zero WIP and zero stale items. If the harness regex changes in a
future plugin version, the comment may need adjusting; the contract is
"keep the literal marker tokens out of this file."

If you genuinely want per-session tracking for a long-running task, add
markers to a scratch file under `.claude/state/` (gitignored) rather
than `Plans.md` — keeps the harness contract clean.

## Remit Metrics

The project's stated remit (README header) is *"thought partner for
senior engineering leaders (Director / VP / senior ICs)."* Adoption is
measured against one north-star and two guardrails. ADR
[#0021](../adrs/0021-remit-level-north-star-metric.md) is the canonical
decision; this section is the one-line operational definition.

**Leadership-toolkit skills (canonical list):** `/onboard`,
`/strategy-doc`, `/stakeholder-map`, `/swot`, `/1on1-prep`, `/present`,
`/architecture-overview`. Update this list and ADR #0021 together when
new leadership skills land.

| Metric | Definition |
|---|---|
| **LE7** (north-star) | % of installs with ≥1 logged event that invoke ≥1 leadership-toolkit skill within 7 days of first event |
| **RU30** (guardrail) | % of leadership-toolkit users who invoke ≥1 leadership-toolkit skill again within 30 days |
| **SMB30** (guardrail) | Median count of *distinct* leadership-toolkit skills per active install per 30-day window |

**"Active install"** for SMB30: ≥1 leadership-toolkit invocation in the
30-day window.

**Substrate** (current): local `~/.claude/usage.jsonl` event log fed by
opt-in `UserPromptSubmit` hook. Build issue tracked separately. **Substrate**
(post-marketplace publish, gated on ADR #0018 items 4 + 5): plugin install
count + plugin-dependents graph + issue/PR references to skill names +
repo stars (trend only).

Roadmap PRs that do not plausibly move LE7 / RU30 / SMB30 (or a measured
proxy) should justify themselves on a different axis (correctness,
contributor velocity, governance) — not by default.

## Usage Log Hook (opt-in)

A `UserPromptSubmit` hook at [`hooks/usage-log.sh`](../hooks/usage-log.sh) detects
leadership-toolkit slash-command invocations and appends one JSONL line per event to
`~/.claude/usage.jsonl`. This feeds the LE7 / RU30 / SMB30 metrics defined in the
[Remit Metrics](#remit-metrics) section.

Detected slashes: `/onboard`, `/strategy-doc`, `/stakeholder-map`, `/swot`,
`/1on1-prep`, `/present`, `/architecture-overview`.

Schema per ADR #0021:
```jsonl
{"ts":"2026-05-24T18:00:00Z","event":"skill_invoked","skill":"/onboard","session":"<id>"}
```

No skill-argument content. No PII. Only `ts`, `event`, `skill`, `session`.

### Install

```sh
fish bin/link-config.fish
fish bin/install-usage-hook.fish
```

`bin/link-config.fish` symlinks `hooks/usage-log.sh` into `~/.claude/hooks/`. Run it
first on a fresh clone. `bin/install-usage-hook.fish` adds a `UserPromptSubmit` entry
to `~/.claude/settings.json`. Both are idempotent.

### Verify

```sh
fish bin/install-usage-hook.fish --check
bash tests/hooks/usage-log.test.sh
```

### Remove

```sh
fish bin/install-usage-hook.fish --remove
```

### Share your usage data

To view your local summary (counts only — no timestamps or sessions):

```sh
fish bin/share-usage.fish
```

To get a pre-filled `gh issue create` command you can run to share with the maintainer:

```sh
fish bin/share-usage.fish --gh
```

The command prints to stdout. You run it manually — nothing is sent automatically.
