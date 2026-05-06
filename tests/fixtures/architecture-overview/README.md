# Fixtures — `/architecture-overview`

Each fixture is a minimal repo shape that exercises a specific eval contract. New fixtures must be added with: (a) eval consumer in [`skills/architecture-overview/evals/evals.json`](../../../skills/architecture-overview/evals/evals.json), (b) entry in the matrix below.

## Criterion → Fixture matrix

| Eval (`evals/evals.json`) | Fixture | Why this fixture |
|---|---|---|
| `produces-bundle-from-yaml` | `ts-only/` | Minimal happy-path: package.json + src + tests; all 4 bundle files have something to render |
| `emits-mermaid-dependency-block` | `ts-only/` | express + pg deps yield ≥2 Modules → clears `graph LR` floor |
| `emits-mermaid-flowchart-block` | `ts-only/` | tests/ + src/ yield ≥3 lifecycle steps → clears `flowchart TD` floor |
| `emits-c4-context-block` | `ts-only/` | manifest deps + env-implied actor yield ≥1 actor + ≥1 adjacent → clears `graph TB` floor *(see [#232](https://github.com/chriscantu/claude-config/issues/232) — purpose-built fixture proposed for deterministic floor exercise)* |
| `skips-mermaid-graph-when-below-complexity-floor` | `no-manifest/` | README + single src file; one Module, zero Seam edges → trips `graph LR` skip |
| `skips-mermaid-flowchart-when-below-complexity-floor` | `no-manifest/` | Single-file repo yields <3 lifecycle steps → trips `flowchart TD` skip |
| `skips-c4-context-when-below-complexity-floor` | `empty/` | `.gitkeep` only — zero adjacent systems, zero actors → trips `graph TB` skip on both halves of the AND |
| `uses-language-vocabulary` | `ts-only/` | Any successful render exercises Module / Interface / Seam / Adapter prose |
| `italic-marks-inferences` | `no-manifest/` | Sparse fixture forces inferred-only entries → italic discipline visible |
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
