# Fixtures — `/architecture-overview`

Each fixture is a minimal repo shape that exercises a specific eval contract. New fixtures must be added with: (a) eval consumer in [`skills/architecture-overview/evals/evals.json`](../../../skills/architecture-overview/evals/evals.json), (b) entry in the matrix below.

## Criterion → Fixture matrix

| Eval (`evals/evals.json`) | Fixture | Why this fixture |
|---|---|---|
| `produces-bundle-from-yaml` | `ts-only/` | Minimal happy-path: package.json + src + tests; all 4 bundle files have something to render |
| `emits-mermaid-dependency-block` | `ts-only/` | express + pg deps yield ≥2 Modules → clears `graph LR` floor |
| `emits-mermaid-flowchart-block` | `ts-only/` | tests/ + src/ yield ≥3 lifecycle steps → clears `flowchart TD` floor |
| `emits-c4-context-block` | `ts-with-context/` | README names a "platform engineer" actor + `pg` dep yields observed postgres adjacent → clears `graph TB` floor deterministically (no model-derived actor required) |
| `mermaid-c4-context-line-style-and-inferred-prefix` | `ts-with-context/` | `STRIPE_API_KEY` in `.env.example` without `stripe` SDK in deps → forces inferred-edge emission (`-.->` + `inferred:`) per output-format.md line-style contract |
| `c4-context-no-banned-vocab-labels` | `ts-with-context/` | Same C4-emit fixture exercises the negative-vocab assertion: model must not use `service:` / `component:` as descriptive labels under `### Context` (testing-strategy.md §4 negative twin) |
| `mermaid-c4-context-actor-uses-person-prefix` | `ts-with-context/` | Same C4-emit fixture; README names "Platform engineer" actor → asserts canonical `Person: <name>` prefix per output-format.md actor-vocab contract (closes #254 problem 1 — drift to bare actor labels invisible without anchored token) |
| `c4-context-person-prefix-not-on-cylinders` | `ts-with-context/` | Same C4-emit fixture exercises negative twin (cylinder scope): `Person:` prefix must NOT appear inside a cylinder `[(...)]` (datastore) node — `postgres` adjacent in this fixture is the regression target; the violation `postgres[(Person: postgres)]` is only physically possible in a fixture that emits a cylinder shape (closes #257; testing-strategy.md §4 pair for the positive prefix eval) |
| `c4-context-person-prefix-not-on-non-actor-rectangles` | `ts-with-context/` | Same C4-emit fixture exercises negative twin (rectangle scope): `Person:` prefix must NOT appear inside a rectangle node whose ID is not `actor*` — `stripe` external SaaS rectangle and `system` self-rectangle are the regression targets (`stripe["Person: Stripe API"]`, `system["Person: billing-service"]`); ID-prefix discrimination (`(?!actor)`) since shape alone cannot distinguish actor from system / external SaaS rectangle (closes #261; testing-strategy.md §4 sibling to cylinder eval) |
| `c4-context-emits-non-actor-rectangle-presence` | `ts-with-context/` | Same C4-emit fixture exercises positive-presence floor for the non-actor rectangle node class: at least one identifier-prefixed non-actor rectangle must appear inside `graph TB`, plus two fixture-specific deterministic floors pinning the `stripe[` external-SaaS rectangle (driven by `STRIPE_API_KEY` env without a `stripe` SDK in deps) AND the `system[` system-under-doc rectangle (canonical output-format.md ID convention). Closes #266 — without this floor, the three `Person:`-not-on-non-actor-* negative twins (#257 / #261 / #265) pass vacuously when the model emits only the actor node and omits system / adjacent rectangles entirely; without the `system[` pin, the generic floor alone is satisfied by `stripe[` and the system-under-doc could still be missing (testing-strategy.md §4 positive-presence convention) |
| `c4-context-person-prefix-not-on-id-less-rectangles` | `ts-with-context/` | Same C4-emit fixture exercises negative twin (ID-less rectangle scope): `Person:` prefix must NOT appear inside a rectangle declared without a leading identifier (`["Person: ledger"]`) — mermaid permits the ID-less form, which the ID-prefixed sibling eval cannot reach because its regex requires a non-empty identifier before `[`; followup to #261 (delivered via PR #264), closes #265 (testing-strategy.md §4 sibling to ID-prefixed rectangle and cylinder evals) |
| `c4-context-person-prefix-not-on-unquoted-id-less-rectangles` | `ts-with-context/` | Same C4-emit fixture exercises negative twin (unquoted ID-less rectangle scope): `Person:` prefix must NOT appear inside an unquoted ID-less rectangle (`[Person: ledger]`) — mermaid permits unquoted single-word labels, which the quoted ID-less sibling eval cannot reach because its `\["` opener requires a quote; followup to #265 (delivered via PR #267), closes #269 (testing-strategy.md §4 fourth twin in the `Person:` shape-discriminated set) |
| `skips-c4-context-when-actor-only` | `actor-only/` | Clears actor half (README names actor) but fails adjacent half (zero deps, zero env) → exercises AND-floor; OR-regression would emit (closes #254 split-AND coverage) |
| `skips-c4-context-when-adjacent-only` | `adjacent-only/` | Clears adjacent half (`pg` dep + `DATABASE_URL`) but fails actor half (README explicitly disclaims actor — "internal library, no human user") → exercises AND-floor; OR-regression would emit (closes #254 split-AND coverage) |
| `skips-mermaid-graph-when-below-complexity-floor` | `no-manifest/` | README + single src file; one Module, zero Seam edges → trips `graph LR` skip |
| `skips-mermaid-flowchart-when-below-complexity-floor` | `no-manifest/` | Single-file repo yields <3 lifecycle steps → trips `flowchart TD` skip |
| `skips-c4-context-when-below-complexity-floor` | `empty/` | `.gitkeep` only — zero adjacent systems, zero actors → trips `graph TB` skip on both halves of the AND |
| `uses-language-vocabulary` | `ts-only/` | Any successful render exercises Module / Interface / Seam / Adapter prose |
| `italic-marks-inferences` | `no-manifest/` | Sparse fixture forces inferred-only entries → italic discipline visible |
| `brittleness-grounded-in-intent` | `research-prototype/` | README explicitly states research-prototype lifecycle + tests deferred by design → exercises intent-qualification (closes #228); positive assertion catches presence of intent qualifier (`prototype` / `deferred` / `expected` / `out of scope` / `not brittle`), `not_regex` twin catches the unqualified `no test surface → brittle` regression class — both `required`-tier per testing-strategy.md §6 (spec-acceptance from issue #228) |
| `refuses-output-inside-claude-config` | `empty/` | Cheap fixture; output-guardrail eval doesn't care about repo content |

## Orphaned fixtures (no eval consumer)

These exist for manual smoke-tests + future eval expansion. Tracked in [#232](https://github.com/chriscantu/claude-config/issues/232).

| Fixture | Intent | Likely future eval |
|---|---|---|
| `go-only/` | go.mod + main.go — non-TS language coverage | `emits-bundle-for-non-ts-repo` (multi-language vocab pass) |
| `monorepo/` | package.json + services/ subdirs — `repos.yaml` `packages:` syntax | `aggregates-monorepo-packages-into-separate-entries` |
| `non-git/` | package.json + src/ but NO `.git/` — graceful-degrade path | `degrades-without-git-metadata` (per `repo-requirements.md` Soft tier) |

## Adding a new fixture

1. Decide which eval(s) consume it. If none — open an issue first; orphan fixtures are technical debt.
2. Pick the smallest possible content that still trips the eval's regex deterministically. Avoid noise that lets the eval pass for the wrong reason (see [#232](https://github.com/chriscantu/claude-config/issues/232) for the `ts-only` C4-determinism case).
3. Add a row to the matrix above naming the eval and stating *why this fixture* — not what it contains. The "what" is in the directory; the "why" is the contract.
4. If the fixture is meant to exercise the *negative* of a contract (vocab discipline, edge-style discipline), document that explicitly — see [Testing strategy: negative-assertion convention](../../../skills/architecture-overview/references/testing-strategy.md).

## Why this matters

Fixture-to-eval mapping has been folklore since v0.1. A future contributor renaming `ts-only/` or restructuring its package.json can break evals without realizing the fixture was the contract. This file is the contract; CI will eventually enforce it (see [#232](https://github.com/chriscantu/claude-config/issues/232) for the proposed `validate.fish` fixture-orphan phase).
