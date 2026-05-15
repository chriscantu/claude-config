# Glossary Skill — Compact Design Spec

**Issue:** [#319](https://github.com/chriscantu/claude-config/issues/319)
**Status:** v1 design, pre-implementation
**Date:** 2026-05-15
**Related:** [#318](https://github.com/chriscantu/claude-config/issues/318) (independent — DTP-routing eval gap)

## Problem (one line)

No long-term memory exists for agreed-upon project terminology; re-hashing erodes consistency across artifacts (ADRs, SDRs, systems-analysis output).

## Approach (one line)

Standalone write-only skill + format-owner for per-project `./CONTEXT.md`; caller-skill invocation from DTP and SA hooks (C-partial v1).

## Out of scope

- SDR / ADR / decision-challenger invocation points (v2)
- Read-discipline in consumer skills (separate concern; v2)
- Consolidate / stale-flag mechanism (v2 — defer unless evals demand)
- Multi-context `CONTEXT-MAP.md` (v2 — promote only when a project warrants split)
- Cross-project shared glossary (never — vocabulary is bounded-context)
- Replacing `MEMORY.md` / `LANGUAGE.md` / `docs/superpowers/decisions/` (compose, don't replace)

---

## 1. Skill surface

### Slash command

```
/glossary <term>                          → interactive: define term in ./CONTEXT.md
/glossary <term> --alias-of <canonical>   → add as _Avoid_ alias under canonical
/glossary --list                          → list current terms
/glossary --conflict                      → review Flagged ambiguities section
```

No-arg `/glossary` → interactive: ask what user wants to do.

### Caller-hook contract

Invoked by caller skill (DTP / SA) at end-of-skill:

```
invoke /glossary --offer-from-caller=<caller-name> --candidate-terms=<term1,term2,...>
```

Skill returns: list of terms user approved + written entries. Caller continues handoff.

### Announce

> "I'm using the glossary skill to canonicalize <N> term(s) before handoff."

Skip announcement if user invoked slash command directly.

---

## 2. File format

Port `grill-with-docs/CONTEXT-FORMAT.md` verbatim as starting point:

```md
# {Project Context Name}

{One or two sentence description.}

## Language

**Term**:
{One-sentence definition — what it IS, not what it does.}
_Avoid_: alias1, alias2

## Relationships

- A **Term-A** produces one or more **Term-B**
- A **Term-B** belongs to exactly one **Term-C**

## Example dialogue

> **User:** "When a **Term-A** does X..."
> **Domain expert:** "Yes, but only after **Term-B** is confirmed."

## Flagged ambiguities

- "alias" was used to mean both **Term-X** and **Term-Y** — resolved: distinct concepts.
```

**Location:** `./CONTEXT.md` at repo root. Lazy-create on first term resolution.
**Multi-context (deferred v2):** `./CONTEXT-MAP.md` at root + per-context `CONTEXT.md` under each bounded context directory.

**Deviations from grill format:**
- None in v1. Adopt verbatim to maximize compatibility with `architecture-overview`'s existing consumer logic.

**Conflict rule (with arch-overview's `LANGUAGE.md`):** CONTEXT.md = domain terms (living, project-owned). LANGUAGE.md = architectural primitives (Module / Interface / Adapter / Seam, one-shot, harness-owned). Different namespaces — no precedence rule needed unless a term collision actually occurs; defer to v2 if observed.

**Conflict rule (with `MEMORY.md` auto-memory):** Terminology facts belong in `./CONTEXT.md`, not auto-memory. Auto-memory may reference but should not duplicate. If auto-memory contains a terminology entry that contradicts CONTEXT.md, CONTEXT.md wins; flag for cleanup.

---

## 3. Caller-hook integration

### DTP hook

Insert in `skills/define-the-problem/SKILL.md` **Step 5: Handoff to Systems Analysis**, BEFORE the "Ready to map dependencies?" confirmation:

```md
### Glossary check (pre-handoff)

After producing the Problem Statement, scan `./CONTEXT.md` (if it exists) for
terms used in the **User** and **Problem** fields. For any term that appears
canonicalized-worthy but is NOT yet in `./CONTEXT.md`, offer `/glossary` to
canonicalize before handoff. Skip silently if `./CONTEXT.md` is absent AND no
term resolution occurred during the five questions.

Trigger criteria (ANY must hold):
- Five-questions path resolved an ambiguous term (`account → Customer`)
- Problem Statement uses a project-specific noun ≥3 times that lacks a
  canonical definition
- User explicitly disambiguated a term during the session

Format the offer as:
> "These terms appeared in the problem statement: [list]. Want to canonicalize
> any in `./CONTEXT.md` before handoff to systems-analysis?"
```

### SA hook

Insert in `skills/systems-analysis/SKILL.md` **Step A: Dependency Mapping**, at the end of the step:

```md
### Glossary check (post-dependency-mapping)

After producing the dependency summary, scan for component / system / data-source
names that recurred ≥2× and lack `./CONTEXT.md` entries. Offer `/glossary`
before continuing to Step B.

Trigger criteria: any named system, service, or shared component in the
dependency summary that does NOT exist in `./CONTEXT.md` AND that the user
specifically named (not inferred from code).
```

Both hooks: **offer, never auto-write**. User-approval is the write-trigger bar.

---

## 4. Eval scope

New `skills/glossary/evals/evals.json`. Minimum scenarios:

| Scenario | Asserts |
|---|---|
| `lazy-create-on-first-term` | First `/glossary` invocation creates `./CONTEXT.md` with frontmatter + Language section |
| `_Avoid_-aliases-recorded` | `/glossary account --alias-of Customer` produces `_Avoid_: account` under `**Customer**` |
| `format-matches-grill-CONTEXT-FORMAT` | Output file regex-matches grill-with-docs CONTEXT-FORMAT.md structure |
| `dtp-hook-offers-on-resolution` | DTP fast-track path with resolved term ends with `/glossary` offer |
| `dtp-hook-skips-when-no-resolution` | DTP fast-track path with no term resolution does NOT offer |
| `sa-hook-offers-on-named-system` | SA dependency mapping with new named service ends with `/glossary` offer |
| `sa-hook-skips-on-no-new-system` | SA scenario where all systems already in CONTEXT.md does NOT offer |
| `decline-does-not-write` | User declines offer → no file write; CONTEXT.md unchanged |
| `flagged-ambiguity-on-conflict` | `/glossary --alias-of` for already-defined alias surfaces conflict in `Flagged ambiguities` |

Per `feedback_sunk_cost_eval.md` — evals are eval-substrate-fixable, not implementation-fixable. Use existing fixture pattern under `tests/fixtures/glossary/`.

---

## 5. Acceptance criteria

Maps to #319 acceptance checklist:

- [ ] All 6 known unknowns resolved in SA comment on #319 ✓ (done)
- [ ] This spec produced ✓ (this file)
- [ ] Skill + 2 caller hooks ship behind eval coverage (≥9 scenarios from §4)
- [ ] At least one project in `~/repos/` exercises living `./CONTEXT.md` for ≥1 week before declaring done
- [ ] No regression in `MEMORY.md` / `LANGUAGE.md` / `docs/superpowers/decisions/` artifact integrity (verify via spot-check of architecture-overview output before + after)
- [ ] Five follow-up issues filed at ship-time (3 invocation-extension for SDR/ADR/decision-challenger + 2 read-discipline scope-decision issues)

---

## 6. Implementation plan (goal-driven, per `rules/goal-driven.md`)

| Step | Verify |
|---|---|
| 1. Scaffold `skills/glossary/{SKILL.md,evals/evals.json,references/}` | `ls` shows files; `bun run validate` passes |
| 2. Port `CONTEXT-FORMAT.md` from grill-with-docs into `references/` | Diff equivalent modulo header rename |
| 3. Write `SKILL.md` slash-command + caller-hook contract per §1 | Read-back matches spec; markdown valid |
| 4. Write 9 eval scenarios under `evals/evals.json` per §4 | `bun run validate` passes phase 1m + 1n |
| 5. Add DTP hook per §3 | DTP eval regression run shows no break; new scenarios pass |
| 6. Add SA hook per §3 | SA eval regression run shows no break; new scenarios pass |
| 7. Run full eval suite | `bun test` green; new scenarios pass under target model |
| 8. File 5 follow-up issues | `gh issue list --label glossary-followup` shows 5 |
| 9. Use in one real project for ≥1 week | Manual checkpoint; observe drift / re-hash rate qualitatively |

Per `rules/execution-mode.md`: 9 tasks, ≤200 LOC functional, single area → **single-implementer mode** (not subagent-driven). Final review at end.

---

## 7. Known risks (from SA)

| Risk | Mitigation |
|---|---|
| Dual-write with MEMORY.md | §2 conflict rule + eval scenario for terminology-in-MEMORY surfacing |
| Stale glossary | Defer to v2; eval signal will tell if v1 needs it sooner |
| Read-discipline gap window | C-partial v1 closes the largest part (DTP/SA) at ship; v2 closes remaining |
| Eager-write scratch-pad | User-approval gate on every write; offer-never-auto-write hook contract |
| Wrong storage location for multi-repo project | `./CONTEXT.md` per repo; multi-repo projects file as v2 follow-up |

---

## 8. Open questions deferred to implementation

- **DTP / SA hook offer-suppression** — when user declines `/glossary` 2× in a row, suppress for rest of session? (Eval will surface annoyance signal)
- **Slash command idempotency** — `/glossary <term>` for already-defined term: edit-in-place or no-op-with-current-definition-shown? (Default: show current + ask edit y/n)
- **Existing CONTEXT.md, no header** — repo has `./CONTEXT.md` but unrecognized format. Migrate, warn, or refuse? (Default: warn + ask)

All low-blast-radius; resolve during implementation, not now.
