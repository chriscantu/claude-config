---
name: strategy-doc
description: Use when the user says /strategy-doc <org>, "draft my 90-day plan", "review the 90-day plan", or "challenge the 90-day plan" during a senior eng leader ramp. Phase 1 supports the 90-day-plan mode only — collates /swot + /stakeholder-map + /architecture-overview + free-form notes/*.md into a 7-section markdown artifact under ~/repos/onboard-<org>/decisions/. Cross-org RFC mode is Phase 2 (separate spec).
disable-model-invocation: true
status: experimental
version: 0.1.0
---

# /strategy-doc — 90-Day Plan Authoring

Personal note-collator for the 90-day-plan deliverable of a senior eng leader ramp. User is the primary reader; the skill is the synthesizer + critic, not an author of opinions.

**Announce:** "I'm using the strategy-doc skill to help you build your 90-day plan."

**Reference files** (read on demand):

- [90-day-plan-template.md](90-day-plan-template.md) — canonical 7-section template + section-fence rules.
- [synthesis.md](synthesis.md) — upstream-input routing rules per section.
- [challenge-checks.md](challenge-checks.md) — layered completeness → quality → consistency passes.
- [export-present.md](export-present.md) — `/present` Slidev handoff mapping.

## Invocation

```
/strategy-doc <org> [--mode=draft|review|challenge] [--workspace <path>] [--continue]
```

`<org>` is required. Default mode is `draft`.

**Flags:**
- `--mode=draft|review|challenge` — see [Mode routing](#mode-routing).
- `--workspace <path>` — override the default `~/repos/onboard-<org>/` resolution. Supports eval fixtures and custom locations.
- `--continue` — only meaningful with `--mode=challenge`. After a Layer 2 quality failure, re-run with this flag to advance to the Layer 3 (consistency, advisory) pass anyway. Skipping Layer 2 fixes is a deliberate choice; the user takes ownership.

**Workspace resolution order:**
1. `--workspace <path>` if provided — use that path directly.
2. Otherwise, `~/repos/onboard-<org>/`.

## Prerequisites (refuse if missing)

1. Resolved workspace directory exists. If absent, refuse with:
   > "Workspace not found at `<resolved-path>`. Run `/onboard <org>` first." (omit `/onboard` hint when `--workspace` was passed, since those are typically eval or custom paths.)
2. `decisions/` subdirectory exists or is creatable. If workspace exists but `decisions/` does not, create it (matches `/onboard` Phase 1 contract).

Do not check upstream skill state (SWOT / stakeholder / arch availability) here — those are graceful-degradation cases handled inside `--mode=draft`.

## Mode routing

| Mode | Effect |
|---|---|
| `draft` (default) | Read existing doc (or scaffold from template), pull upstream evidence per [synthesis.md](synthesis.md), populate inside-fence content. Preserve outside-fence user prose. **After writing, output the complete file content verbatim to the terminal** (read the file back and print every line including user prose between and below fences) so the user can review it. Do NOT substitute a summary or status message for the full content. |
| `review` | Read the doc; render section-by-section to terminal (print the full markdown content). No mutation. No checks. |
| `challenge` | Run layered checks per [challenge-checks.md](challenge-checks.md). Layer 1 fail skips 2-3. Layer 2 fail gates Layer 3 behind `--continue`. All clean → offer `/present` handoff per [export-present.md](export-present.md). |

## Doc location

Single artifact per ramp at `<workspace>/decisions/<creation-date>-90-day-plan.md`.

**Glob outcome routing** — every `--mode=draft` run starts with `glob <workspace>/decisions/*-90-day-plan.md`:

| Glob result | Action |
|---|---|
| 0 files | First-run path. Create `<workspace>/decisions/<today>-90-day-plan.md` from template. (Create `decisions/` if it doesn't exist — matches `/onboard` Phase 1 contract.) |
| 1 file | Mutate that file in place. Do NOT create a new dated file even if today differs from the file's date. |
| 2+ files | Refuse mutation. Emit a list with each filename + `mtime` (sorted newest first) and ask the user to consolidate. One artifact per ramp is invariant. The refusal must be idempotent — re-running after another ambiguous state must produce the same list, not silently mutate the newest. |

**Atomic write semantics** — for the 0-file and 1-file cases, perform every mutation as a write-temp-then-rename:

1. Render the new doc content to `<workspace>/decisions/.<final-filename>.tmp`.
2. Validate the rendered content's section-fences before rename.
3. `rename(.tmp, <final-filename>)` only if validation passes; the rename is atomic on POSIX, so the original file is never observed in a partially-written state.
4. On any failure between step 1 and step 3 (validation fail, write error, signal interrupt): delete the `.tmp` file, leave the original untouched, surface the failure cause to the user.

This forbids partial writes, prevents data loss on interrupted runs, and means a malformed-fence damage report from `--mode=draft` is always paired with a fully-preserved original file.

## Confidentiality

Before reading any path inside the workspace, run:

```fish
bun run "$CLAUDE_PROJECT_DIR/skills/onboard/scripts/onboard-guard.ts" refuse-raw <path>
```

The guard refuses paths under `notes/raw/` (non-zero exit). Skill MUST honor the refusal — do not read the file. Exit-code contract and override policy: see [../onboard/refusal-contract.md](../onboard/refusal-contract.md).

## Upstream-input degradation (graceful)

| Missing input | Behavior |
|---|---|
| Memory MCP unavailable | Warn once. Continue with filesystem-only inputs. |
| `<Org> SWOT` entity missing/empty | Inside-fence `[TODO: no SWOT data — run /swot <org> --mode=add or write notes/]` markers in §1-3. |
| `<Org> Stakeholders` entity missing | Similar `[TODO]` in §1, §7. |
| `arch/` directory absent or empty | Skip arch synthesis. `[TODO]` in §1. |
| `notes/*.md` empty / dir absent | Skip notes pass. No error. |

Rule: missing input never aborts draft. Skill emits whatever skeleton it can; `[TODO]` markers signal gaps for the user (and trigger challenge layer 1 fail later).

## Section-fence sentinels

Auto-populated content lives inside `<!-- strategy-doc:auto -->` ... `<!-- /strategy-doc:auto -->` pairs. Outside-fence content is user-owned. Malformed fences refuse mutation; emit damage report. See [90-day-plan-template.md](90-day-plan-template.md) for the canonical pattern.

**Fence pre-check (--mode=draft only):** When an existing doc is found, validate fences IMMEDIATELY — before loading memory MCP, arch, or notes. If any fence is malformed (unclosed, nested, or mismatched), emit the damage report and stop. Do NOT proceed to upstream-input loading. Fence validation is a 2-second read of the existing file; doing it first avoids 3–4 minutes of unnecessary upstream-input work.

## Out of scope (Phase 1)

- `--mode=rfc` cross-org strategy / RFC authoring (Phase 2).
- Multi-variant audience export (manager / peers / reports views with redaction) — Phase 2.
- Memory entity for strategy doc — filesystem-only Phase 1.
- Multi-org concurrent workspace handling.
- Interactive `--capture` flag — user writes `notes/*.md` directly Phase 1.
