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

**Fence-crossing bound — canonical pattern shape.** When an assertion targets a violation *inside* a specific mermaid block (e.g., a `Person:` inversion under `### Context`'s `graph TB` block), the lazy run between the block's opening token and the violation MUST refuse to cross the closing ``` fence. Use `(?:(?!```)[\s\S])*?` in place of `[\s\S]*?` for that segment. Without the fence-crossing bound, a violation in a *later* mermaid block (deps `graph LR`, data-flow `flowchart TD`) leaks into the assertion and false-bans a clean target block. The `### Context[\s\S]{0,500}` co-location bound only governs the run from the section header to the *first* fence — it does not bound the run from `graph TB` to the violation. Closes [#268](https://github.com/chriscantu/claude-config/issues/268).

### 4. Negative-assertion convention (vocabulary discipline)

**Every positive vocabulary assertion needs a negative twin.** Vocabulary contracts are violated by *commission* (using a banned term) more often than by *omission* (failing to use a canonical term). Positive-only coverage gives false confidence.

Concrete example:

| Type | Pattern | Catches |
|---|---|---|
| Positive | `\b(Module\|Interface\|Seam\|Adapter)\b` | Skill never used canonical vocab |
| Negative | `(?:###\s+Context[\s\S]{0,800})\bservice:` | C4 block ships `service:` labels (regression) |

The negative twin scopes its match to the section under contract — a global negative `\bservice\b` would fire on prose mentions of the word, not vocab use.

Negative-twin coverage for the C4 Context block landed via [#232](https://github.com/chriscantu/claude-config/issues/232) as `c4-context-no-banned-vocab-labels`. The dependencies.md / data-flow.md negative twins remain open work.

#### Regex-design rationale: shape-discriminated negative twins for `Person:` actor-vocab

The `Person:` prefix is reserved for actor nodes per output-format.md actor-vocab contract. Inversion (the prefix on a non-actor node) splits into regression classes by mermaid node shape, each needing a different regex shape:

- **Cylinder scope** (`c4-context-person-prefix-not-on-cylinders`, #257) — shape-only discrimination. Cylinders `[(...)]` are reserved for datastores per output-format.md datastore-shape contract. Any `Person:` inside a cylinder is a violation regardless of node ID. Pattern: `\[\([^\)]*?Person:`.
- **Rectangle scope (ID-prefixed)** (`c4-context-person-prefix-not-on-non-actor-rectangles`, #261) — shape-only is impossible. Actors AND systems-under-doc AND external SaaS all use rectangles. Pattern uses ID-prefix discrimination: `(?!actor)[A-Za-z][\w-]*\[(?!\()[^\]]*?Person:` with the `\[(?!\()` rectangle-not-cylinder opener and `(?!actor)` lookahead anchored to the canonical `actor` ID convention from output-format.md's example. The `(?<![A-Za-z0-9_-])` lookbehind prevents mid-identifier matches. The `i` flag is global to the pattern: it covers `Actor` capitalization drift on the ID side, AND it relaxes `Person:` to match `person:` / `PERSON:`. The latter relaxation is acceptable here — non-canonical `Person:` casing is itself a vocab violation, so catching it under this assertion is desirable, not a defect.
- **Rectangle scope (ID-less)** (`c4-context-person-prefix-not-on-id-less-rectangles`, #265) — followup to the ID-prefixed twin above. Mermaid permits ID-less rectangle declarations (`graph TB\n  ["Person: ledger"]`); the ID-prefixed pattern's `[A-Za-z][\w-]*\[` segment requires a non-empty identifier and silently misses this form. Pattern: `(?<![A-Za-z0-9_\]\)-])\["[^"]*?Person:` — pre-`[` lookbehind excludes letters / digits / `_` / `-` (would be the ID-prefixed case) plus `]` / `)` (edge-syntax or cylinder closer); the `\["` opener restricts to quoted-label rectangles so the cylinder opener `[(` stays on the cylinder eval. Whitespace and newline pass; `>` (edge-arrow tail) also passes — `--> ["Person: …"]` is the same vocab violation. These twins are needed because the `[A-Za-z][\w-]*\[` boundary in the ID-prefixed regex is load-bearing for ID-prefix discrimination: a single combined regex would either drop the discrimination or duplicate the cylinder-opener exclusion in a fragile way. Targeted second assertion was chosen over the positive-bound rewrite (every `Person:` must co-occur with an actor edge) since the rewrite would require multi-pass regex / assertion combinator support not present in the runner.
- **Rectangle scope (unquoted ID-less)** (`c4-context-person-prefix-not-on-unquoted-id-less-rectangles`, #269) — followup to the quoted ID-less twin above. Mermaid permits unquoted single-word labels in ID-less rectangles (`graph TB\n  [Person: ledger]`); the quoted ID-less pattern's `\["` opener requires a quote after the rectangle opener and silently misses this form. Pattern: `(?<![A-Za-z0-9_\]\)-])\[(?!\(|")[^\]]*?Person:` — pre-`[` lookbehind mirrors the quoted ID-less twin; post-`[` negative lookahead `(?!\(|")` excludes the cylinder opener `[(` (cylinder eval) AND the quoted ID-less opener `["` (quoted ID-less eval), so each of the four twins stays scoped to one syntactic shape. Multi-word unquoted inversions (`[Person: Platform engineer]`) cannot occur because mermaid rejects unquoted whitespace; single-word inversions (`[Person: ledger]`, `[Person: stripe]`) are the reachable regression target. Strategy chosen per #269: a fourth twin scoped to the unquoted opener, NOT widening the `\["?` opener on the quoted twin — the four-twin layout keeps each regex single-purpose and avoids fragile paired tightening of the cylinder exclusion.

Brittleness trade-offs acknowledged (both directions):

- **False-positive direction** — ID-prefix discrimination depends on the model emitting `actor` / `actor1` / etc. for actor nodes, per the canonical example. Drift to `engineer1[…]` or `user[…]` for legitimate actor nodes would false-positive. **This is intentional — the false-positive surfaces convention drift on the canonical actor-ID prefix**, which is itself worth catching. If a non-`actor*` ID lands as an accepted alternative for actor nodes, the regex needs a positive-bound rewrite (every `Person:` must co-occur with the actor edge, not with a fixed ID prefix).
- **False-negative direction** — conversely, a non-actor node whose ID coincidentally starts with `actor` (e.g., `actorOfNotaryService` for an external SaaS) would slip past. Mitigation is the same positive-bound rewrite; until then, this miss is documented and accepted.

Pattern documented here so future contributors expanding negative twins (container/component-level vocab inversion at C4 Level 2+, prose vocab inversion outside mermaid) understand why one twin uses shape alone and the other layers ID discrimination on top.

All four twins additionally apply the fence-crossing bound from §3: the segment between `graph\s+TB` and the violation uses `(?:(?!```)[\s\S])*?`, not the unbounded `[\s\S]*?`, so a violation in a later mermaid block cannot leak into the C4 Context assertion ([#268](https://github.com/chriscantu/claude-config/issues/268)).

#### Positive-presence floor for absence-of-violation negative twins

A `not_regex` assertion checks *absence of a violation*, which a vacuously empty target satisfies trivially. If the model emits a C4 block containing only the actor node (omitting the system-under-doc and adjacent rectangles entirely), every `Person:`-not-on-non-actor-* negative twin passes — there are no non-actor rectangles to violate the rule. Positive-only coverage on the actor side (`mermaid-c4-context-actor-uses-person-prefix`) does not catch this because it asserts actor-presence, which the regression preserves.

**Convention:** when a negative-twin family asserts absence-of-violation across a node class (non-actor cylinders + non-actor rectangles + ID-less rectangles), pair it with a positive-presence floor asserting the node class is non-empty. The pair shape:

| Assertion | Type | Catches |
|---|---|---|
| Negative twin family | `not_regex` × N | `Person:`-prefix inversion across each sub-shape |
| Positive-presence floor | `regex` (this convention) | Block-emission regression that empties the node class entirely |

For C4 Context, the positive-presence floor is `c4-context-emits-non-actor-rectangle-presence` ([#266](https://github.com/chriscantu/claude-config/issues/266)): asserts ≥1 identifier-prefixed non-actor rectangle exists inside `graph TB`, mirroring the ID-prefix discrimination shape of its negative-twin sibling (`(?!actor)[A-Za-z][\w-]*\[(?!\()`). The same `### Context[\s\S]{0,500}` co-location bound (§3) and `(?:(?!```)[\s\S])*?` fence-crossing bound (§3, [#268](https://github.com/chriscantu/claude-config/issues/268)) apply — a non-actor rectangle in a later mermaid block (deps `graph LR`, data-flow `flowchart TD`) must not false-pass an empty C4 block.

Fixture-specific positive-presence assertions (e.g., `stripe[` rectangle for `ts-with-context/`) layer on top of the generic floor when the fixture deterministically forces a specific adjacent — these pin the exact node declaration so a regression that emits the inferred-edge prose (`-.->` + `inferred:`) but omits the node declaration itself is caught directly, rather than leaning on lazy-match satisfiability of sibling evals.

**Scope decision (#266):** positive-presence floor is added per-block, not generically across all mermaid blocks — the contract that "a C4 block must have ≥2 nodes beyond the actor" is a per-block invariant. Cross-block presence (deps / data-flow) is a separate audit (out of scope for #266).

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
