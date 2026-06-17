---
name: risk-register
description: >
  Use when the user says /risk-register, "add a risk", "review risks",
  "escalate R-N", "ack R-N", "resolve R-N", or "show my risk register"
  during a 90-day ramp or any initiative. Tracks org-level technical
  risks in any initiative workspace. Six actions: add, review, ack,
  escalate, resolve, list.
status: experimental
version: 0.1.0
---

# /risk-register — Lightweight Technical Risk Register

Maintains a single durable risk register at `<workspace>/risks/register.md` for
a senior leader tracking org-level technical risk. Manual-first: no live
integrations. Six actions, all backed by one bun helper.

**Announce at start:** "I'm using the risk-register skill to track your technical risks."

## Helper invocation

All state changes go through the script. Never edit `register.md` by hand.

```fish
bun run "$CLAUDE_PROJECT_DIR/skills/risk-register/scripts/risk-register.ts" <action> <ws> [<R-N>] [flags]
```

(`CLAUDE_PROJECT_DIR` is harness-provided. If unset, walk up from CWD until a
`.git` directory is found.) The script is **action-first**. When the user phrases
it workspace-first ("/risk-register ~/ramps/acme review"), reorder to
action-first before calling.

## Actions

| Action | Invocation | Effect |
|--------|-----------|--------|
| add | `add <ws> --desc "<text>" [--likelihood low\|med\|high] [--impact …] [--owner …] [--mitigation …]` | Append a risk. Only `--desc` required; likelihood/impact default to `med`, owner/mitigation to `TBD`. |
| review | `review <ws> [--stale-days N]` | Read-only meeting glance: summary header, escalated, stale, top-3 active. Default action. |
| ack | `ack <ws> <R-N>` | Bump last-reviewed; no status change. |
| escalate | `escalate <ws> <R-N>` | Flip to escalated; bump last-reviewed. |
| resolve | `resolve <ws> <R-N>` | Flip to resolved; drops out of `review`, stays in `list`. |
| list | `list <ws>` | All risks including resolved, with IDs. |

If the user gives no action, default to `review` (highest-frequency, read-only).

## ID acquisition and substring resolution

`review` and `list` always show the `R-N` ID next to each description. For
mutating actions the user may name a risk by description substring instead of an
ID — resolve it to the `R-N` from the latest `list`/`review`, then CONFIRM before
calling the script:

> Escalate R-7 "API auth keys not rotated"?

The script accepts `R-N` only. Substring resolution lives here, not in the script,
so evals stay deterministic.

## Status banner

The helper prints `Status: ready (risk-register)` to stderr on every run.

## Storage

Register lives at `<ws>/risks/register.md`. The skill takes any directory path;
it does not require an `/onboard` workspace. See
[the design spec](../../docs/superpowers/specs/2026-06-16-risk-register-design.md)
for the full design.
