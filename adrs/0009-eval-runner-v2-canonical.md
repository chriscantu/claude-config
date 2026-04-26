# ADR #0009: v2 eval runner is canonical; v1 frozen and scheduled for deletion

Date: 2026-04-25

## Responsible Architect
Cantu

## Author
Cantu

## Contributors

* Claude (design partner)

## Lifecycle
POC

## Status
Accepted (2026-04-25)

## Context

Two eval runners ship in `tests/`:

- **v1 (`tests/eval-runner.ts`)** — shells `claude --print`, reads stdout text,
  asserts via regex/substring on prose.
- **v2 (`tests/eval-runner-v2.ts`)** — shells `claude --print --output-format
  stream-json`, parses the NDJSON event stream, and asserts against
  *structured signals* (`finalText`, `toolUses`, `skillInvocations`).
  Adds `skill_invoked` / `not_skill_invoked` / `tool_input_matches` /
  `chain_order` / `skill_invoked_in_turn` structural assertions on top
  of the existing regex/substring set. Multi-turn chains supported.

Both wired in `package.json` (`evals:v1`, `evals:v2`). v2 substrate
landed in [#86](https://github.com/chriscantu/claude-config/issues/86)
(closed 2026-04-17) and the first round of structural ports landed in
[#89](https://github.com/chriscantu/claude-config/pull/89) (merged
2026-04-17). [#92](https://github.com/chriscantu/claude-config/issues/92)
covers porting remaining regex assertions to structural where a
structural form exists; it does NOT cover deleting v1.

Without a retirement plan three failure modes accumulate:

1. **Substrate ambiguity.** New contributors see two runners with no
   declared canonical, and may add evals against v1 — undoing the
   structural migration.
2. **Maintenance debt.** v1 must keep pace with the same `evals.json`
   schema, runner CLI flags, and transcript paths as v2. Two substrates,
   one schema, two surfaces to break.
3. **Eval-quality regression.** Regex-on-prose assertions are
   over-fittable to a single phrasing and silent-fire when the model
   restructures output. Structural assertions over the tool stream
   (`skill_invoked`, `tool_input_matches`) are the pattern v2 was built
   to enable; leaving v1 ungated invites authors to default back to the
   easier-to-write but lower-signal form.

## Decision

Three-step retirement plan:

**Step 1 — Freeze v1 (this PR).**

`tests/EVALS.md` declares v2 canonical and v1 closed to new evals.
Existing v1 evals continue to run on `bun run evals:v1` until Step 3.
New evals MUST be authored against v2 (`bun run evals:v2`), even when
the assertions happen to be regex-only — v2 supports the full v1
assertion set plus structural signals.

**Step 2 — Migration deadline (triggered by #92 close).**

When [#92](https://github.com/chriscantu/claude-config/issues/92) closes
(remaining structural-portable assertions migrated), a 30-day countdown
opens. During that window any surviving regex-only assertions in v1
files migrate to v2 with a regex-text rationale documented in the
eval's `description` field per #92 acceptance criteria.

**Step 3 — Delete v1 (within 30 days of #92 close).**

Separate PR removes:

- `tests/eval-runner.ts`
- The `evals:v1` script in `package.json`
- Any v1-only helpers in `tests/evals-lib.ts` not consumed by v2
- v1 references in `tests/EVALS.md`

Same PR renames `evals:v2` to `evals` (the canonical name) and adds an
`evals:v2` alias only if a CI matrix or external script depends on the
literal string. Otherwise the rename is clean.

The deletion PR also supersedes this ADR with a brief #0010 ("v1 eval
runner removed") rather than editing #0009 in place — preserves the
historical record of the freeze decision and matches the supersession
pattern used elsewhere in `adrs/`.

## Alternatives Considered

**A. Delete v1 immediately.** Skip the freeze period; cut v1 in this PR.
Rejected: a handful of v1 evals still hold regex-only assertions covered
by #92. Deleting v1 before #92 closes either drops coverage or forces
an emergency port. The freeze + 30-day window converts a forced rush
into scheduled work.

**B. Keep both runners indefinitely; declare v2 "preferred".** Rejected:
"preferred" without enforcement is the status quo, which is exactly the
ambiguity the issue identifies. Without a deletion date, v1 maintenance
debt compounds and the structural-migration goal stalls.

**C. Lint v1 to allow only structural assertions.** Block new
regex-only assertions in v1 via a CI check. Rejected as redundant: if
new evals must use v2 (per Step 1 freeze), the lint adds nothing —
and v1 regex assertions are the very thing #92 is migrating off. We
don't need a lint to police a substrate scheduled for deletion.

**D. Migration deadline by absolute date instead of #92-close trigger.**
Pick a calendar date (e.g., 2026-06-01) regardless of #92 status.
Rejected: #92 close is the load-bearing event. Deleting v1 before #92
closes drops coverage; deleting after is fine on any reasonable cadence.
The 30-day window after the trigger keeps the deletion bounded without
forcing a coverage gap.

## Consequences

**Positive:**

- Single canonical runner removes substrate ambiguity for new contributors.
- Maintenance burden halves once Step 3 lands — one runner, one schema
  surface, one transcript convention.
- Structural-assertion default (the v2 pattern) becomes the only path
  for new evals, locking in the migration goal.
- Deletion PR is mechanical and contained: file removal + script rename
  + doc edit. Risk is low because behavioral coverage moves to v2 *before*
  v1 is removed (per Step 2 acceptance).

**Negative:**

- 30-day window between #92 close and v1 deletion is a soft commitment;
  if no one opens the deletion PR, v1 lingers. Mitigation: #139 already
  tracks the deletion PR — close it only when v1 is removed.
- Surviving regex-only assertions that have NO structural equivalent
  (e.g., asserting on the model's prose phrasing) move to v2 wrapped
  in `regex` / `not_regex` assertion types, which v2 supports — but
  this requires the eval author to add a `description` rationale per
  #92. Lightweight, but real friction during migration.
- The `evals:v2` → `evals` rename is a breaking change for any
  external script invoking the v2 script literally. Mitigation: this
  repo is the only consumer; the rename PR scans for `evals:v2`
  references before removing the alias.

**Promotion conditions (POC → Accepted permanent):**

- v1 deletion PR lands within 30 days of #92 close.
- No new v1 evals authored during the freeze window (confirms Step 1
  enforcement is observed).
- Post-deletion, no eval coverage regression — every behavioral signal
  v1 covered has a v2 equivalent.

**Rejection conditions:**

- #92 stalls past 90 days, leaving the freeze in indefinite limbo.
  Action: revisit whether v2 needs additional substrate work to make
  #92 closeable, OR cut the deletion PR with surviving regex
  assertions ported as `regex` types.
- Authors observed adding new evals to v1 during the freeze (Step 1
  not enforced). Action: promote freeze from documentation to a CI
  check (file mtime on `tests/eval-runner.ts` evals).

## References

**Supersedes:** none
**Superseded by:** none (track via [#139](https://github.com/chriscantu/claude-config/issues/139); deletion PR will introduce #0010)

- [Issue #139](https://github.com/chriscantu/claude-config/issues/139) —
  retirement plan request
- [Issue #86](https://github.com/chriscantu/claude-config/issues/86) —
  v2 substrate (closed 2026-04-17)
- [PR #89](https://github.com/chriscantu/claude-config/pull/89) —
  structural assertions landed (merged 2026-04-17)
- [Issue #92](https://github.com/chriscantu/claude-config/issues/92) —
  port remaining structural-portable assertions (still open; load-bearing
  trigger for Step 2)
- [ADR #0005](./0005-behavioral-adr-promotion-requires-discriminating-signal.md)
  — discriminating-signal requirement (applies to promotion conditions above)
- `tests/EVALS.md` — freeze declaration (Step 1)
