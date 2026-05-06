# Testing Strategy — `/architecture-overview`

Design principles for the eval suite at [`evals/evals.json`](../evals/evals.json). New evals must conform to the conventions below; deviations need a one-line rationale in the eval's `description` field.

## Substrate limit

Evals run **inside the conversation** — the eval harness inspects the model's response prose, not files written to disk. Every assertion is a regex against response text. Concretely:

- A skill can claim "I wrote inventory.md" without writing it; no eval today catches that lie.
- File-format invariants (frontmatter shape, mermaid syntax, markdown structure) are tested transitively via the model's narration of what it wrote, not directly.
- The substrate floor sets the coverage ceiling. Out-of-conversation harness tracked in [#232](https://github.com/chriscantu/claude-config/issues/232) (or its successor).

This is documented honestly in [`evals/evals.json`](../evals/evals.json)'s top-level `description` field. Don't pretend otherwise — the gap is a known and accepted trade-off, not a defect.

## Conventions

### 1. Skill-fired structural floor

Every eval MUST include `{ type: "skill_invoked", skill: "architecture-overview", tier: "required" }`. This catches the "skill never loaded" failure class — the highest-leverage assertion in the suite, because every content assertion is conditional on the skill having fired.

### 2. Tight regex over loose regex

Anchor assertions on structural markers that the contract pins, not on prose the model can rephrase:

- `>\s*_diagram skipped:` (anchors on blockquote `>` + italic `_`) — tight
- `(diagram|skipped|skip)` (matches conversational mention) — loose

Loose patterns produce false-positives that mask real regressions. When tightening would over-fit (e.g., asserting LANGUAGE.md vocab usage), say so in the assertion `description` field.

### 3. Co-locate content assertions to their structural anchor

Mermaid block assertions should anchor to the section header they live under:

```
# Loose — could match graph TB anywhere in response
"```mermaid[\\s\\S]*?graph\\s+TB"

# Tight — co-locates to the `### Context` section
"###\\s+Context[\\s\\S]{0,500}```mermaid[\\s\\S]*?graph\\s+TB"
```

Retroactive anchoring for v0.2 evals (`emits-mermaid-dependency-block`, `emits-mermaid-flowchart-block`) and v0.3 (`emits-c4-context-block`) landed via [#232](https://github.com/chriscantu/claude-config/issues/232).

### 4. Negative-assertion convention (vocabulary discipline)

**Every positive vocabulary assertion needs a negative twin.** Vocabulary contracts are violated by *commission* (using a banned term) more often than by *omission* (failing to use a canonical term). Positive-only coverage gives false confidence.

Concrete example:

| Type | Pattern | Catches |
|---|---|---|
| Positive | `\b(Module\|Interface\|Seam\|Adapter)\b` | Skill never used canonical vocab |
| Negative | `(?:###\s+Context[\s\S]{0,800})\bservice:` | C4 block ships `service:` labels (regression) |

The negative twin scopes its match to the section under contract — a global negative `\bservice\b` would fire on prose mentions of the word, not vocab use.

Negative-twin coverage for the C4 Context block landed via [#232](https://github.com/chriscantu/claude-config/issues/232) as `c4-context-no-banned-vocab-labels`. The dependencies.md / data-flow.md negative twins remain open work.

### 5. Fixture suitability — exercise the contract, not the renderer

A fixture's job is to deterministically push the skill into the state under test. If the fixture *might* trip the assertion depending on model interpretation, the eval is testing the model, not the contract.

- Good: `empty/` for skip-on-no-adjacents — zero content, zero ambiguity.
- Better: `ts-with-context/` for emit-on-≥1-adjacent — README names the actor explicitly + `.env.example` exposes both observed (`DATABASE_URL` paired with `pg` dep) and inferred (`STRIPE_API_KEY` without client lib) adjacencies; deterministic floor exercise (closes #232 C-1).
- Avoid: `ts-only/` for C4-emit assertions — relies on the model deriving the actor from manifest deps. Kept for the `emits-mermaid-dependency-block` / `emits-mermaid-flowchart-block` evals where the floor is deterministic from deps + tests alone.

Document fixture-to-criterion mapping in [`tests/fixtures/architecture-overview/README.md`](../../../tests/fixtures/architecture-overview/README.md). Orphan fixtures (no eval consumer) are technical debt, not optionality.

### 6. Tier policy

Per-assertion `tier` value drives runner gate behavior:

- `required` — spec-acceptance behaviors (issue acceptance criteria, security guardrails). A failure exits non-zero and gates CI / pre-push hooks.
- `diagnostic` — polish, discoverability, error-message quality. A failure is reported in output (suffixed `[diagnostic]`) but does NOT gate exit. The doc historically called this tier "advisory"; the runner schema uses `diagnostic`. Same semantics.

A flaky `diagnostic` assertion should not block ship; a flaky `required` assertion should.

**Default for new assertions:** `required`. Demote to `diagnostic` only when:

- The assertion's pattern is too broad to carry strong signal (e.g., a three-way OR matching almost any plausible response — see `italic-marks-inferences` content assertion for an example).
- The assertion checks polish (italic discipline, advisory-prose presence) rather than a spec-acceptance contract.
- A flake here would reasonably warn but not block.

The `skill_invoked` structural floor on every eval ALWAYS stays `required` per §1 — the skill firing is load-bearing; without it, every content assertion is conditional.

**Promotion / demotion:** when a contributor flips an assertion's tier, name the rationale in the assertion `description` field (one line). Example: `diagnostic (per testing-strategy.md §6): pattern is broad three-way OR — polish discipline, not spec acceptance. skill_invoked floor stays required.`

Cross-skill alignment: `diagnostic` is shared semantics across every skill that uses `tests/eval-runner-v2.ts` — the tier vocabulary is owned by the runner, not per-skill. Adoption is opt-in per assertion.

### 7. Skip-blockquote canonical form

When a contract says "below floor → skip the block", the skip note follows ONE canonical shape across the entire skill:

```
> _diagram skipped: <reason — natural-language explanation>_
```

The reason field carries the block-specific information (e.g., "no adjacent systems discovered — single isolated Module"). The prefix stays uniform so a single regex (`>\s*_diagram skipped:`) covers all skip cases. Block-typed prefixes like `_C4 Context skipped:` are an anti-pattern — they fragment the contract for no information gain.

## Adding a new eval

1. Pick the structural anchor (section header, fenced block opener, output-line shape).
2. Decide positive vs negative — every contract about vocabulary or discipline gets both.
3. Pick the smallest fixture that deterministically exercises the contract.
4. Write the regex tight; over-tightness is fixable in review, over-looseness ships silent regressions.
5. Add the skill_invoked floor.
6. Document the fixture row in [`tests/fixtures/architecture-overview/README.md`](../../../tests/fixtures/architecture-overview/README.md).
7. Set tier per §6.

## Why this matters

The skill ships behavior, not code — the eval suite IS the spec. A loose suite means the spec drifts silently as the model improves and the contract erodes. These conventions exist so that "passing evals" stays load-bearing as the suite scales.
