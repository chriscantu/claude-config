# Correctness Adversary — main@d567778

**Diff scope**: 1 file, +3 LOC (docstring only; the documented function is unchanged but now carries an asserted contract with unguarded edges)

## Findings (ranked, worst first)

### 1. Negative `pageNumber` silently returns items from the END of the array
**Where**: `paginate.ts:16-17`
**Why it matters**: `start = (pageNumber - 1) * pageSize` goes negative for `pageNumber ≤ 0`, and `Array.prototype.slice` treats negative indices as offsets from the end. This does not throw — it returns plausible-looking but wrong data. `paginate(['a','b','c'], -1, 1)` → `start = -2`, `slice(-2, -1)` → `['b']`. Caller asked for a nonsensical page and got a real element back with no error. That's the worst kind of silent corruption.
**Suggested probe**: `expect(paginate(['a','b','c'], -1, 1).items).toEqual([])` — currently returns `['b']`. Also `pageNumber = 0` → `slice(-1, 0)` → `[]` (accidentally right, for the wrong reason).

### 2. `pageSize = 0` yields `totalPages: Infinity`
**Where**: `paginate.ts:15`
**Why it matters**: `Math.ceil(all.length / 0)` = `Infinity`, so `Math.max(1, Infinity)` = `Infinity`. The returned `totalPages` is `Infinity` — a garbage value any caller using it for loop bounds or a "page X of N" label will render/iterate incorrectly. `items` comes back `[]` (slice(0,0)), so nothing crashes; the bad value propagates silently.
**Suggested probe**: `expect(paginate(['a','b'], 1, 0).totalPages).toBe(???)` — currently `Infinity`. Decide contract: throw, or clamp.

### 3. `pageNumber > totalPages` echoes an invalid `pageNumber` with empty items
**Where**: `paginate.ts:17-18`
**Why it matters**: Requesting a page past the end returns `{ items: [], pageNumber: <whatever was passed>, totalPages }`. The returned `pageNumber` can exceed `totalPages`, so the result object is internally inconsistent — a caller trusting `pageNumber ≤ totalPages` (a reasonable invariant for a paginator) is misled. No clamp, no error.
**Suggested probe**: `paginate(['a','b','c'], 99, 2)` → `{ items: [], pageNumber: 99, totalPages: 2 }`. Assert whether `pageNumber` should clamp to `totalPages` or throw.

### 4. Fractional `pageSize` / `pageNumber` produce off-by-fraction slices
**Where**: `paginate.ts:15-17`
**Why it matters**: Inputs are typed `number`, not `int`. `pageSize = 1.5` → `start = (pageNumber-1)*1.5`, `slice` truncates toward zero on fractional bounds, and `totalPages` uses the fractional divisor — so page boundaries drift and pages can overlap or gap. `paginate(['a','b','c','d'], 2, 1.5)` → `start = 1.5`, `slice(1.5, 3)` → `['b','c']`, while page 1 was `slice(0,1.5)` → `['a']` — element `'b'` never appears alone, boundaries are incoherent.
**Suggested probe**: `paginate(['a','b','c','d'], 1, 1.5)` vs page 2 — check for dropped/duplicated elements across consecutive pages.
