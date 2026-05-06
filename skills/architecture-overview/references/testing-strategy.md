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

Tracked retroactively for v0.2 evals in [#232](https://github.com/chriscantu/claude-config/issues/232).

### 4. Negative-assertion convention (vocabulary discipline)

**Every positive vocabulary assertion needs a negative twin.** Vocabulary contracts are violated by *commission* (using a banned term) more often than by *omission* (failing to use a canonical term). Positive-only coverage gives false confidence.

Concrete example:

| Type | Pattern | Catches |
|---|---|---|
| Positive | `\b(Module\|Interface\|Seam\|Adapter)\b` | Skill never used canonical vocab |
| Negative | `(?:###\s+Context[\s\S]{0,800})\bservice:` | C4 block ships `service:` labels (regression) |

The negative twin scopes its match to the section under contract — a global negative `\bservice\b` would fire on prose mentions of the word, not vocab use.

This is a v0.3.1+ design principle; today's suite has the positive half (`uses-language-vocabulary`) but not the negative half. Tracked in [#232](https://github.com/chriscantu/claude-config/issues/232).

### 5. Fixture suitability — exercise the contract, not the renderer

A fixture's job is to deterministically push the skill into the state under test. If the fixture *might* trip the assertion depending on model interpretation, the eval is testing the model, not the contract.

- Good: `empty/` for skip-on-no-adjacents — zero content, zero ambiguity.
- Risky: `ts-only/` for emit-on-≥1-adjacent — depends on model deriving an actor + adjacent system from `package.json` deps.

Document fixture-to-criterion mapping in [`tests/fixtures/architecture-overview/README.md`](../../../tests/fixtures/architecture-overview/README.md). Orphan fixtures (no eval consumer) are technical debt, not optionality.

### 6. Tier policy

All current evals are `tier: required` — passing the suite is launch-gating. As the suite grows past ~15 evals, split:

- `required` — spec-acceptance behaviors (issue acceptance criteria, security guardrails)
- `advisory` — polish, discoverability, error-message quality

A flaky `advisory` eval should not block ship; a flaky `required` eval should. Tier split scaffold tracked in #232's adjacent issues.

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
