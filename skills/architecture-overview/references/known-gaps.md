# Known Gaps — `/architecture-overview`

Current version: **v0.3.1 (Experimental)**

Limitations the skill ships with. Update on each version bump. Honest gaps beat silent surprise.

## Discovery / Composition

- Auto-discovery handshake with `/improve-codebase-architecture` not implemented
- ADR-conflict surfacing not implemented (skill reads ADRs but doesn't grade)
- Brittleness heuristic nomination deferred (observation-only) — intent-grounding follow-up: #228

## Output / Rendering

- C4 Level 2+ (containers/components) deferred — v0.3 lands Level 1 only
- Concept-validation phase enforcing italic-on-inferred deferred (convention only)

## `repo-stats.ts`

- Non-UTF8 binary detection is best-effort (size-only filter; non-UTF8 first-8KB check deferred)
- `envVarsReferenced` test coverage is structural (`Array.isArray`) only — no fixture currently exercises a positive match
- LOC count uses `content.split("\n").length` — off-by-one (+1) for files ending in newline
