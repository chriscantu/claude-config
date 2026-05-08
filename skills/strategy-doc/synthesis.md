# Synthesis Rules — `/strategy-doc` Phase 1

How to combine upstream inputs into the 7 sections of the 90-day-plan during `--mode=draft`. Each rule fires independently; the skill walks rules section-by-section.

## Inputs

| Source | Read via | Always read? |
|---|---|---|
| `<Org> SWOT` memory entity | `mcp__memory__search_nodes("<Org> SWOT")`. If entity missing or MCP unavailable, fall back to reading `<workspace>/memory-seed.json` (eval fixture proxy — load the `entities` array and treat it as the in-memory state). | Yes (warn + skip if both MCP and memory-seed.json absent) |
| `<Org> Stakeholders` memory entity | `mcp__memory__search_nodes("<Org> Stakeholders")`. Same fallback: `<workspace>/memory-seed.json`. | Yes |
| Architecture bundle | `<workspace>/arch/{inventory,dependencies,data-flow,integrations}.md` via `Read` | Yes (skip if any file absent) |
| Free-form notes | glob `<workspace>/notes/*.md` (exclude `notes/raw/`) | Yes |

Where `<workspace>` is the resolved workspace path (from `--workspace <path>` if provided, else `~/repos/onboard-<org>/`).

## Confidentiality precondition

Before reading any path under the workspace, run:

```fish
bun run "$CLAUDE_PROJECT_DIR/skills/onboard/scripts/onboard-guard.ts" refuse-raw <path>
```

For URLs and paths outside the workspace, the guard is a no-op and exits 0. For paths inside `notes/raw/`, the guard exits non-zero — the skill MUST refuse to read.

## Section-by-section synthesis

### Section 1 — What I learned

Combine signal across all four sources into 3-6 bullets. Each bullet cites at least one source:

- SWOT entity entries (any quadrant) — pull observations with multi-source landscape tags.
- Stakeholder entity — political-topology highlights (e.g., "engineering-product alignment confirmed by 3 directors").
- Arch bundle — top 1-2 facts from `inventory.md` + key seams from `data-flow.md`.
- Notes — emergent themes appearing across multiple `notes/*.md` files.

If a source is empty, omit its contribution silently — do not emit "no SWOT data" stub here. Section 1 surface is "what I learned." Empty sources just mean less learned.

### Section 2 — What is working

Pull only:

- SWOT **Strengths** quadrant entries.
- Stakeholder entries tagged as allies / supporters.

2-5 bullets, each with source citation. Do not invent positives — if both sources empty, leave as `[TODO: capture during /swot --mode=add or 1on1 reviews]`.

### Section 3 — Problems I have observed

Routing rule: a problem qualifies if it has **multi-source corroboration** OR **direct code-grounded evidence**.

| Source signal | Section 3 if... |
|---|---|
| SWOT **Weaknesses** | Mentioned in 2+ entries OR landscape-tagged with same theme |
| SWOT **Threats** | Multi-source OR stakeholder-corroborated |
| Stakeholder gap | Confirmed by absence of 1on1 with named role (`stakeholder-map` confirms gap) |
| Arch finding | Code-grounded: cited from `inventory.md` / `dependencies.md` / `integrations.md` |
| Notes hunch | Promote to §3 only if a SWOT entry or stakeholder entry corroborates same theme |

Per-entry format (literal):

```markdown
- **<Problem>**
  - Evidence: <source A path/citation>, <source B path/citation>
  - Confidence: confirmed (≥2 independent sources) | likely (1 strong source + 1 weak)
```

### Section 4 — Problems I suspect

Routing rule: signal exists but does NOT meet Section 3's corroboration bar.

| Source signal | Section 4 |
|---|---|
| Single SWOT entry, no landscape tag | Default |
| Stakeholder pattern from <3 interviews | Default |
| Notes hunch with no SWOT/stakeholder echo | Default |

Per-entry format (literal):

```markdown
- **<Suspected problem>**
  - Source: <single source path/citation>
  - To confirm: <evidence that would corroborate>
  - To refute: <evidence that would rule out>
```

The "To confirm" and "To refute" fields are required — they are what enables a Section 6 validation milestone to target this entry.

### Section 5 — Specific asks

Skill cannot synthesize asks from upstream. Leave the inside-fence content as `[TODO: user-supplied]`. Surface a hint: "Section 5 requires user input — asks can't be inferred from observations alone."

### Section 6 — 30/60/90 milestones

Skill cannot synthesize commitments from upstream. Leave inside-fence as `[TODO: user-supplied]` plus the literal sub-headings `### W1-30`, `### W30-60`, `### W60-90` so the user has a structure to fill.

### Section 7 — Risks and dependencies

Pull from:

- SWOT **Threats** quadrant.
- Arch `integrations.md` — external-dependency risks.
- Stakeholder entries marked as blockers / no-allies.

Per-entry format requires a named owner. If the upstream source doesn't name an owner, write `[TODO: assign owner]` for that field — challenge layer 2 will flag it.

## Conflicting evidence

A conflict is a **deterministic surface-area collision**, not a semantic
judgment. The synthesis pass MUST emit `[CONFLICT: ...]` markers when both of
the following hold:

1. **Same surface area** — the same noun phrase (case-insensitive,
   whitespace-normalized — single spaces, no leading/trailing whitespace)
   appears in two or more upstream sources. Different surface areas (e.g.,
   "payments service latency" vs. "payments service throughput") are NOT a
   conflict, even if they sound related.
2. **Opposite sentiment tag** — the same surface area is tagged with
   sentiment-opposite categories across sources. Categories considered
   opposite:
   - SWOT `[strength]` ↔ SWOT `[weakness]` or SWOT `[threat]`
   - SWOT `[opportunity]` ↔ SWOT `[threat]`
   - Stakeholder `ally` ↔ Stakeholder `blocker`
   - Notes prose marked as positive ("strong", "excellent", "high") ↔
     notes prose marked as negative ("weak", "poor", "low") about the same
     surface area
   - Arch finding (code-grounded) contradicting an upstream claim about
     the same module/integration

Emission format (literal — the regex `\\[CONFLICT` is the challenge-layer-1
gate):

```
[CONFLICT: <source-A> says "<verbatim or close-paraphrase>"; <source-B> says "<verbatim or close-paraphrase>"; resolve before challenge]
```

The conflict marker MUST appear in the section that would otherwise carry the
observation (typically §1, §2, §3, or §7). Do NOT silently pick one source
and drop the other — the marker is the contract that makes the disagreement
visible to the user.

**Out-of-scope conflicts (Phase 1):**

- Temporal shifts ("X was strong in Q1, weak in Q3") are NOT conflicts when
  both sources agree on the trajectory; surface as a single annotated
  observation.
- Homonyms (different things named X) — if the surface phrase is identical
  but the entities differ, emit `[CONFLICT: ...]` anyway. False positives
  are cheaper than false negatives here; the user resolves manually.

Challenge layer 1 treats unresolved `[CONFLICT` markers as incompleteness —
challenge fails until the user removes or resolves them. The challenge-pass
gate is a regex check on the literal `[CONFLICT` substring; this is the
sole load-bearing surface for the conflict contract.
