# Risk Register Skill Design

**Date:** 2026-06-16
**GitHub issue:** #21 (P1-high)
**Status:** Locked — ready for writing-plans

---

## Problem Statement

A senior eng leader (VP or Director) starting a new role at Cloudera is accountable for org-level technical risk during a 90-day ramp. Risk state today is scattered across tickets, notes, and memory. There is no fast review surface before planning meetings or leadership syncs. Stale risks go invisible and escalations get missed.

The `/risk-register` skill gives the leader a single, durable risk register in any initiative workspace. They can add risks, review what is stale or escalated, ack a risk (bump its reviewed date without changing status), escalate it, resolve it, or list everything — all before a meeting catches them off guard.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D-1 | Storage path is `<workspace>/risks/register.md`, NOT `docs/risks/`. | User override from issue #21 default. The onboard ramp workspace is already the durable home for org-specific state (per ADR #0020 and the `/onboard` skill). Putting risk data there keeps it co-located with the stakeholder map, SWOT, and decisions — all artifacts a leader reviews together. |
| D-2 | One file per workspace, not one file per risk. | Simplest model that satisfies the review action. Per-risk files add file-system complexity for no benefit at this scale. YAGNI. |
| D-3 | Monotonic IDs (R-1, R-2, …) are append-only. | IDs are used for `ack`, `escalate`, and `resolve` action references. Gaps are acceptable; renumbering is not (breaks references in meeting notes or linked tickets). |
| D-4 | `--today YYYY-MM-DD` flag for eval determinism. | `Date.now()` produces non-deterministic output that breaks eval fixtures. This mirrors the pattern used across the onboard family. |
| D-5 | Onboard-family by convention, but mechanically just takes a path. | The skill takes any directory path as its workspace arg. It does NOT require an `/onboard` workspace to exist. It writes `<path>/risks/register.md` under whatever dir is given, creating `risks/` if absent. The default use case is an onboard ramp workspace, but the skill is usable for any initiative, not only a ramp. |

---

## Architecture

```
skills/risk-register/
  SKILL.md                  ← routing, actions, status banner
  scripts/
    risk-register.ts        ← all mutation logic (bun)
  evals/
    evals.json

tests/                                ← repo-root, per house convention
  risk-register.test.ts               ← bun unit tests
  fixtures/risk-register/
    register-stale.md     ← fixture: two risks, one with old last-reviewed date
    register-active.md    ← fixture: fresh risks, none stale
    register-bad-id.md    ← fixture: well-formed register, no R-99
    register-escalated.md ← fixture: one active, one escalated, one resolved
```

Unit tests and fixtures live at the repo root `tests/` (matching `org-design`), NOT under the skill dir.

The SKILL.md routes six actions to `scripts/risk-register.ts`. The script does all file reads and writes. Claude does not mutate the register directly.

The workspace path is a positional CLI argument (`<ws>`), resolved the same way as `onboard-status.ts` — the caller passes an absolute path and the script validates it exists before doing anything else.

---

## Components

### SKILL.md

Frontmatter:

```yaml
---
name: risk-register
description: >
  Use when the user says /risk-register, "add a risk", "review risks",
  "escalate R-N", "ack R-N", "resolve R-N", or
  "show my risk register" during a 90-day ramp or any initiative.
  Tracks org-level technical risks in any initiative workspace.
  Six actions: add, review, ack, escalate, resolve, list.
status: experimental
version: 0.1.0
---
```

Status banner (emit to stderr on every invocation):

```
Status: ready (risk-register)
```

The SKILL.md routes the six actions below: `add`, `review`, `ack`, `escalate`, `resolve`, `list`. All state mutation goes through the script. Claude must not edit `register.md` directly.

### scripts/risk-register.ts

Bun TypeScript helper. Arg-parse pattern mirrors `onboard-status.ts`:

- Top-level `die(msg, code)` helper that writes to stderr and calls `process.exit`.
- `parseArgs(argv)` returns a typed struct; unknown flags call `die`.
- `main()` returns a number; `if (import.meta.main) process.exit(main())`.
- All file I/O via `node:fs` sync APIs (`readFileSync`, `writeFileSync`, `existsSync`, `mkdirSync`).

---

## Data Model

### register.md format

Three sentinel states: `active`, `escalated`, `resolved`.

```markdown
# Risk Register — <org>
<!-- risk-register:auto -->

### R-1: <description>   <!-- risk:active -->
- **Likelihood**: <low|med|high>  **Impact**: <low|med|high>
- **Owner**: <name or TBD>
- **Mitigation**: <text or TBD>
- **Last reviewed**: YYYY-MM-DD

### R-2: <description>   <!-- risk:escalated -->
- **Likelihood**: high  **Impact**: high
- **Owner**: <name or TBD>
- **Mitigation**: <text or TBD>
- **Last reviewed**: YYYY-MM-DD

### R-3: <description>   <!-- risk:resolved -->
- **Likelihood**: low  **Impact**: low
- **Owner**: <name or TBD>
- **Mitigation**: <text or TBD>
- **Last reviewed**: YYYY-MM-DD
```

Key rules:

- The `<!-- risk-register:auto -->` sentinel follows the H1. It marks the auto-managed region. The script reads and writes only content after this sentinel.
- Each entry is an H3 with the ID and description on the same line, followed by the inline sentinel `<!-- risk:active -->`, `<!-- risk:escalated -->`, or `<!-- risk:resolved -->`.
- Fields are a flat bullet list. Order is fixed: Likelihood + Impact (same line), Owner, Mitigation, Last reviewed.
- IDs are monotonic integers prefixed with `R-`. The script finds the highest existing ID and increments by 1 for each `add`. The `R-N` ID appears adjacent to the description in all `review` and `list` output.
- Likelihood and impact values are `low`, `med`, or `high` (lowercase). Stored in the file as labels. Never shown as a numeric sum in output.
- `--desc` is the only REQUIRED field for `add`. `--likelihood` and `--impact` default to `med` when omitted (no prompt, no interactive fallback). `--owner` and `--mitigation` default to `TBD` when omitted. The one-liner path is primary: `/risk-register <ws> add "desc"` produces a complete entry. Interactive prompting is a fallback only.
- Trade-off note: defaulting likelihood and impact to `med` means some risks carry provisional severity until refined. This can skew the sort slightly. This is accepted: a captured risk with provisional severity is better than an uncaptured one. The `review` action surfaces all active risks regardless of sort position, so nothing is lost.

#### Severity display and sort key

Severity is never stored as a number. It is computed at render time only, as a sort key.

- **Sort key:** `low=1`, `med=2`, `high=3`. Sort key = likelihood_value + impact_value (range 2–6, higher is worse).
- **Tie-break:** when two risks have equal sort keys, the one with higher impact ranks above the one with higher likelihood. Example: `low/high` (sum=4) ranks above `med/med` (sum=4) because impact=3 > impact=2.
- **Display tag:** render as a two-letter bracketed tag — first letter = likelihood initial, second = impact initial; each is `L`, `M`, or `H`. Examples: `[HH]` = high/high, `[MH]` = med/high, `[LM]` = low/med. The numeric sum is NEVER shown to the user.

---

## Actions and CLI Contract

All actions are invoked as:

```
bun run "$CLAUDE_PROJECT_DIR/skills/risk-register/scripts/risk-register.ts" <action> <ws> [options]
```

(`CLAUDE_PROJECT_DIR` is harness-provided. If unset, walk up from CWD until `.git` is found.)

### add

```
risk-register.ts add <ws> --desc "<text>" [--likelihood <low|med|high>] [--impact <low|med|high>] [--owner "<name>"] [--mitigation "<text>"] [--today YYYY-MM-DD]
```

- `--desc` is the ONLY required flag.
- `--likelihood` and `--impact` default to `med` when omitted. Not prompted — the default applies silently.
- `--owner` and `--mitigation` default to `TBD` when omitted.
- Appends a new `### R-N` block to `register.md`.
- Sets `Last reviewed` to `--today` value (defaults to system date if omitted, for non-eval use).
- Creates `<ws>/risks/` directory if missing. Creates `register.md` with the H1 and sentinel if it does not exist yet.
- Prints a confirmation to stdout that teaches the applied defaults: `Added R-N (med/med, owner TBD) — refine with escalate/ack or re-add`. When non-default values are used, print the actual values: `Added R-N (high/high, owner Dana)`.
- Interactive prompting (e.g., asking for likelihood before calling the script) is a SKILL.md-layer fallback only. The primary path is the one-liner with defaults.
- Future: `review` could surface risks with `Owner: TBD` as a separate prompt. Not in this version.

### review

```
risk-register.ts review <ws> [--stale-days N] [--today YYYY-MM-DD]
```

- READ-ONLY. Never writes to `register.md`.
- Default stale threshold: 14 days.
- Resolved risks are EXCLUDED from all sections of `review` output. They remain in the file for audit and appear in `list`.
- The `Status: ready (risk-register)` banner goes to stderr. All report content goes to stdout.
- Bare `/risk-register <ws>` with no action defaults to `review`. This is the highest-frequency, read-only action and the safest default.

Output format (five-minute pre-meeting glance):

1. Header line: `RISK REVIEW — <org>          <N> active (<N> stale) · <N> escalated · <N> resolved`. "active" = all non-escalated non-resolved risks; "stale" is the parenthetical subset of those past the threshold. The two buckets are NOT additive — stale ⊂ active. This avoids the sentinel-state name collision (`active`) and the double-count where a stale risk is also active.
2. Separator line: `================================================================`
3. **ESCALATED** section: all escalated risks, sorted by severity (descending). Section heading shows count.
4. **NEEDS REVIEW — stale >14d** section: active risks whose `Last reviewed` is older than `--stale-days` relative to `--today`, sorted by severity (descending). Section heading shows count and threshold.
5. **TOP ACTIVE** section: the three highest-severity active risks that are NOT stale and NOT escalated. Heading shows count and total (e.g., `TOP ACTIVE (3 of 5)`). Shows however many exist if fewer than 3.
6. Empty sections are omitted entirely — do not print the section heading or a blank line in its place.
7. If all three sections are empty after omissions, prints: `No risks require attention.`
8. If the register is empty or does not exist, prints: `No risks tracked.`

Each risk renders as exactly two lines:

- Line 1: `  [XX] R-N  <description>` (two-space indent; severity tag; ID; description)
- Line 2: `            owner: <name> · reviewed YYYY-MM-DD` (indented to align with description; for stale risks, show `last seen YYYY-MM-DD  (N days)` instead of `reviewed`)

Rendered example:

```
RISK REVIEW — <org>          5 active (2 stale) · 1 escalated · 4 resolved
================================================================

ESCALATED (1)
  [HH] R-7  Data-platform migration has no rollback plan
            owner: Priya · reviewed 2026-06-14

NEEDS REVIEW — stale >14d (2)
  [HH] R-2  API auth keys not rotated in 90 days
            owner: TBD · last seen 2026-05-01  (46 days)
  [MH] R-5  Vendor SSO contract expires Q3, no renewal owner
            owner: TBD · last seen 2026-05-20  (27 days)

TOP ACTIVE (3 of 3)
  [HH] R-9  Single SRE owns all prod deploy access
            owner: Marco · reviewed 2026-06-15
  [MH] R-4  Test coverage on billing path under 20%
            owner: Dana · reviewed 2026-06-12
  [MM] R-1  Onboarding docs stale, slows new-hire ramp
            owner: TBD · reviewed 2026-06-10
```

Escalated + stale overlap rule: an escalated risk that is also past the stale threshold appears ONLY in the Escalated section (escalated takes precedence — no double-listing). However, the stale-age annotation (`(N days)`) MUST still appear in the Escalated section on that risk's line 2, so the "nobody has touched this" signal is not lost. Example line 2: `owner: TBD · last seen 2026-05-01  (46 days)`.

Severity sort: see "Severity display and sort key" in the Data Model section. Two-letter tag is rendered; numeric sum is used only as the sort key. Tie-break: higher impact ranks first.

A risk that is active, high-severity, and recently reviewed (within threshold) appears ONLY in "TOP ACTIVE" — not in Stale or Escalated. The top-3 section exists precisely to keep such risks visible.

### ack

```
risk-register.ts ack <ws> <R-N> [--today YYYY-MM-DD]
```

- Bumps the `Last reviewed` field on the named entry to `--today` (defaults to system date).
- Does NOT change the entry's status sentinel. An active risk stays active; an escalated risk stays escalated.
- Use this to acknowledge "I looked at this, it is still active" so it stops surfacing as stale after the next `review` run.
- Prints: `R-N acked.`
- Note: the read-only report action is `review`; this mutating "I looked at it" action is `ack`. They are distinct to avoid confusion (`reviewed` was a near-homophone of `review`).

### escalate

```
risk-register.ts escalate <ws> <R-N> [--today YYYY-MM-DD]
```

- Flips the sentinel on the named entry from `<!-- risk:active -->` to `<!-- risk:escalated -->`.
- Bumps `Last reviewed` to `--today` value.
- Prints: `R-N escalated.`
- After escalate: `Last reviewed` = escalation date.

### resolve

```
risk-register.ts resolve <ws> <R-N> [--today YYYY-MM-DD]
```

- Flips the sentinel on the named entry to `<!-- risk:resolved -->` (from any prior state).
- Bumps `Last reviewed` to `--today` value.
- The entry stays in the file for audit. It is excluded from `review` but included in `list`.
- Prints: `R-N resolved.`

### list

```
risk-register.ts list <ws>
```

- Prints all entries in the register to stdout, in order (active, escalated, AND resolved).
- Each entry must show the `R-N` ID adjacent to the description so the user can copy it for mutating actions.
- If the register is empty or does not exist, prints: `No risks tracked.`

### help / discoverability

```
risk-register.ts --help
```

- Prints the six-action list, one line each, with a single usage example. No register is read.
- Bare invocation with no args (`risk-register.ts` or `/risk-register` with no workspace) also prints this help output.
- Format:
  ```
  Usage: risk-register <action> <ws> [options]

  Actions:
    add       Add a new risk (--desc required; --likelihood/--impact default to med)
    review    Show stale, escalated, and top active risks (read-only; default action)
    ack       Acknowledge a risk without changing status: ack <ws> <R-N>
    escalate  Escalate a risk: escalate <ws> <R-N>
    resolve   Mark a risk resolved: resolve <ws> <R-N>
    list      List all risks including resolved

  Example: risk-register add ~/ramps/cloudera --desc "Vendor SSO contract expires Q3"
  ```

**Arg order:** the script `risk-register.ts` is action-first (`<action> <ws>`), matching `onboard-status.ts`. The SKILL.md slash layer accepts natural ws-first phrasing (`/risk-register ~/ramps/cloudera review`) and reorders to action-first before calling the script. Evals invoke the slash form; the script contract stays action-first.

#### ID acquisition and substring resolution

`review` and `list` always show `R-N` adjacent to the description. Users copy the ID for mutating actions.

Mutating actions (`ack`, `escalate`, `resolve`) accept a DESCRIPTION SUBSTRING at the SKILL.md routing layer — the LLM resolves it to an `R-N` and confirms before calling the script:

> Escalate R-7 "Data-platform migration has no rollback plan"?

The deterministic CLI contract (`risk-register.ts`) takes `R-N` IDs only. Substring resolution lives in SKILL.md, not the script. This keeps evals deterministic while reducing friction for human users.

---

## Error Handling

| Condition | Behavior |
|-----------|----------|
| `<ws>` dir does not exist | `die("workspace not found: <ws>. Pass your initiative workspace path, e.g. ~/ramps/cloudera.", 1)` |
| `<ws>/risks/` dir missing on `add` | Create it with `mkdirSync(..., { recursive: true })` |
| `register.md` missing on `review` or `list` | Print `No risks tracked.` and exit 0 |
| `register.md` missing on `escalate` | `die("no register at <ws>/risks/register.md", 1)` |
| `register.md` missing on `ack` | `die("no register at <ws>/risks/register.md", 1)` |
| `register.md` missing on `resolve` | `die("no register at <ws>/risks/register.md", 1)` |
| `escalate` with an ID not in the file | `die("R-N not found. Run 'list' to see current IDs (highest is R-<max>).", 1)` (exit nonzero, nothing written) |
| `ack` with an ID not in the file | `die("R-N not found. Run 'list' to see current IDs (highest is R-<max>).", 1)` (exit nonzero, nothing written) |
| `resolve` with an ID not in the file | `die("R-N not found. Run 'list' to see current IDs (highest is R-<max>).", 1)` (exit nonzero, nothing written) |
| Malformed register (missing sentinel, broken H3 structure) | `die("malformed entry near line <N>: expected '### R-N' header. Open <ws>/risks/register.md to fix, or restore from git.", 1)`. Name the failing line. No silent rewrite. |
| Unknown action or flag | `die("unknown arg: <arg>", 2)` |
| Empty register on `review` | Print `No risks tracked.` and exit 0 (not an error) |

Every user-facing invocation emits the banner to stderr FIRST:

```
Status: ready (risk-register)
```

---

## Testing and Evals Plan

### Unit tests (bun test)

File: `tests/risk-register.test.ts` (or inline alongside the script — mirror whatever the onboard family uses).

| Test | What it checks |
|------|---------------|
| `add` appends a new block with the correct ID | File content includes `### R-2` after a second add |
| `add` creates `risks/` dir and `register.md` when missing | Both exist after the call |
| `add` with no `--owner` or `--mitigation` | File has `Owner: TBD` and `Mitigation: TBD` |
| `add` one-liner with all defaults omitted | Call with `--desc` only; file has `Likelihood: med`, `Impact: med`, `Owner: TBD`, `Mitigation: TBD`; stdout contains `Added R-1 (med/med, owner TBD)` |
| `review` returns stale entries only | Fixture `register-stale.md` with one entry dated 30 days ago; `--today` set; only that entry appears in Stale section |
| `review` returns escalated regardless of date | Escalated entry with a recent date surfaces in Escalated section |
| `review` returns nothing when register is fresh and no escalated | All entries within threshold, none escalated; output is `No risks require attention.` |
| `review` summary header counts all states | Register with 2 active + 1 escalated + 1 resolved: header reads `2 active (0 stale) · 1 escalated · 1 resolved` |
| `review` excludes resolved risks from all sections | Resolved entry does not appear in Escalated, Stale, or Top active sections |
| `review` top-3 active section surfaces fresh high-severity risk | Active high/high risk within threshold appears in Top active section |
| `review` severity sort — high/high before low/low | Within a section, `[HH]` tag entry appears before `[LL]` tag entry |
| `review` severity tie-break — higher impact ranks above higher likelihood | Two risks with equal sum: `low/high` (sum=4) appears before `med/med` (sum=4) |
| `review` severity tag format | Output contains two-letter `[XX]` tag; no numeric sum in stdout |
| `review` empty section omission | When no escalated risks exist, `ESCALATED` heading does not appear in output |
| `review` escalated+stale overlap shows stale annotation | Escalated risk past threshold appears only in ESCALATED section AND shows `(N days)` annotation |
| `escalate` flips sentinel | `<!-- risk:active -->` becomes `<!-- risk:escalated -->` in the file |
| `escalate` bumps last-reviewed | `Last reviewed` field updates to `--today` value |
| `escalate` bad ID exits nonzero | `die` called with message including `Run 'list'`; file unchanged |
| `ack` bumps last-reviewed without changing status | `Last reviewed` updates to `--today`; sentinel unchanged |
| `ack` bad ID exits nonzero | `die` called with message including `Run 'list'`; file unchanged |
| `resolve` flips sentinel to resolved | `<!-- risk:active -->` becomes `<!-- risk:resolved -->` in the file |
| `resolve` bumps last-reviewed | `Last reviewed` field updates to `--today` value |
| `resolve` bad ID exits nonzero | `die` called with message including `Run 'list'`; file unchanged |
| `list` includes resolved entries | Resolved risk appears in `list` output |
| `list` shows R-N IDs | Each entry in `list` output has its `R-N` ID adjacent to the description |
| Malformed register exits nonzero | Corrupted fixture triggers `die` with message naming line number |

### Evals (evals/evals.json)

Six required-tier evals. Format mirrors `org-design/evals/evals.json`. Skill-invocation assertions are diagnostic-tier per strategy-doc/#157.

**Division of labor:** the helper script writes the register via `writeFileSync` in a Bash subprocess, so there is no `Write` tool call in the eval transcript. The eval runner (`tests/evals-lib.ts`, `tests/eval-runner-v2.ts`) has no file-content assertion type — assertions match transcript tool-call inputs and final output text only. Deterministic file-mutation correctness (e.g., the exact sentinel written to register.md) is proven by the bun unit tests, which read `register.md` after each call. The evals only prove that the skill invokes the helper with the right command and the helper prints the right stdout.

**1. add-writes-block**

- Setup: empty temp dir
- Prompt: `/risk-register <tmp-ws> add "API auth not rotated in 90 days"` (no likelihood, impact, owner, or mitigation flags — tests default path)
- Assertions (required):
  - `tool_input_matches` Bash `command` containing `risk-register.ts add` — script is actually invoked with the add action
  - `regex` `Added R-1` — stdout confirms new entry ID
  - `regex` `med/med` — stdout confirmation teaches the applied defaults
  - `regex` `owner TBD` — owner default surfaced in confirmation

**2. review-surfaces-stale**

- Setup: copy `tests/fixtures/risk-register/register-stale.md` to `<tmp-ws>/risks/register.md` (entry with `Last reviewed: 2026-05-01`)
- Prompt: `/risk-register <tmp-ws> review --today 2026-06-16`
- Assertions (required):
  - `tool_input_matches` Bash `command` containing `risk-register.ts review`
  - `regex` `stale|overdue` — the stale section heading or label appears in stdout
  - `regex` `R-1` — the stale entry ID surfaces (proves a real file read, not a canned response)

**3. escalate-flips-sentinel**

- Setup: copy `tests/fixtures/risk-register/register-active.md` to `<tmp-ws>/risks/register.md`
- Prompt: `/risk-register <tmp-ws> escalate R-1 --today 2026-06-16`
- Assertions (required):
  - `tool_input_matches` Bash `command` containing `risk-register.ts escalate`
  - `regex` `R-1 escalated` — stdout confirmation present

**4. escalate-bad-id-refuses**

- Setup: copy `tests/fixtures/risk-register/register-active.md` to `<tmp-ws>/risks/register.md` (no R-99)
- Prompt: `/risk-register <tmp-ws> escalate R-99`
- Assertions (required):
  - `tool_input_matches` Bash `command` containing `risk-register.ts` and `R-99`
  - `not_regex` `R-99 escalated` — refusal confirmed, no success output
  - `regex` `not found` — error surface
  - `regex` `list` — error message references `list` action so user knows how to recover

**5. ack-bumps-date**

- Setup: copy `tests/fixtures/risk-register/register-active.md` to `<tmp-ws>/risks/register.md` (R-1 active with old `Last reviewed`)
- Prompt: `/risk-register <tmp-ws> ack R-1 --today 2026-06-16`
- Assertions (required):
  - `tool_input_matches` Bash `command` containing `risk-register.ts ack`
  - `regex` `R-1 acked` — stdout confirmation present

**6. resolve-drops-from-review**

- Setup: copy `tests/fixtures/risk-register/register-active.md` to `<tmp-ws>/risks/register.md` (R-1 active)
- Step 1 prompt: `/risk-register <tmp-ws> resolve R-1 --today 2026-06-16`
- Step 2 prompt: `/risk-register <tmp-ws> review --today 2026-06-16`
- Assertions on step 1 (required):
  - `tool_input_matches` Bash `command` containing `risk-register.ts resolve`
  - `regex` `R-1 resolved` — stdout confirmation present
- Assertions on step 2 (required):
  - `not_regex` `R-1` — resolved risk does not appear in review output

All six evals include `teardown: rm -rf <tmp-ws>`.

### Issue #21 AC#2 behavioral done-check

AC#2 is satisfied when: after `escalate`, the `Last reviewed` field in the file equals the escalation date; after `ack`, the `Last reviewed` field equals the ack date. A grep that finds the field present but does not compare its value does NOT satisfy this check.

### validate.fish gate

The existing `validate.fish` script must stay green after adding the new skill dir. It checks:

- Frontmatter schema (name, description, status, version fields present)
- Internal link integrity (no broken `[text](path)` references in SKILL.md)
- Slug no-collision (skill `name` field is unique across `skills/*/SKILL.md`)

No new validate.fish rules are needed for this skill. Run before declaring the PR ready.

---

## Out of Scope (YAGNI)

These are not in this skill. Do not add them without a new issue.

- **Live integrations** — no Jira, Linear, or PagerDuty sync
- **Multi-user or shared registers** — single leader, single workspace
- **Per-risk files** — one register file per workspace, not one file per risk
- **Calendar integration** — no auto-reminder or meeting-sync
- **Risk scoring formulas** — likelihood and impact are labels, not a numeric model (severity rank is a sort key for review output only, not a stored field)
- **Archiving or deletion** — resolved risks stay in the file; no archive or delete action

---

## References

- GitHub issue #21 (P1-high) — acceptance criteria source
- `skills/onboard/SKILL.md` — frontmatter convention, status banner pattern
- `skills/onboard/scripts/onboard-status.ts` — arg-parse + die/exit pattern
- `skills/org-design/evals/evals.json` — eval assertion format reference
- ADR #0020 — memory layer primary and delegations (per-org workspace as state home)
- `docs/superpowers/specs/2026-04-30-onboard-design.md` — onboard family design context
