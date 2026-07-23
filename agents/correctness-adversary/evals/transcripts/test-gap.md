# Test-Gap Adversary — main_@7beb33e

**Diff scope**: 1 file, +1/−1 LOC (`paginate.ts:13`)

## Findings (ranked, worst first)

### 1. `paginate()` has zero tests — an off-by-one regression ships unopposed
**Where**: `paginate.ts:11-16` (code) — test suite: **MISSING** (no `*.test.ts`/`*.spec.ts` anywhere in the repo)
**Why it matters**: The diff changes `const start = (pageNumber - 1) * pageSize` → `pageNumber * pageSize`. The JSDoc contract (`paginate.ts:8-9`) states pages are **1-indexed**: page 1 = `all[0 .. pageSize)`. Post-change, page 1 returns `all[pageSize .. 2*pageSize)` — every caller silently skips the first page and off-sets by one page thereafter. With no test file in the tree, CI is green and this behavioral inversion is invisible. This is the single largest untested code path in the diff: the *entire* function is uncovered.
**Suggested probe**:
```
cd /private/tmp/corr-swarm-fixture
# assert the 1-indexed contract
bun test <<'add a test>'  # expect(paginate([1,2,3,4], 1, 2).items).toEqual([1,2])
git stash && bun test   # baseline HEAD passes the assertion
git stash pop && bun test  # working tree FAILS -> proves the gap
```
The test that pins `page 1 === all[0..pageSize)` fails on the working tree and passes on `git checkout paginate.ts` — that delta is exactly the regression test that should have blocked this.

### 2. `totalPages` return field is never asserted
**Where**: `paginate.ts:12,15` — MISSING
**Why it matters**: `totalPages = Math.max(1, Math.ceil(all.length / pageSize))` is computed and returned but no test verifies it. Ceiling/`max(1,…)` boundary logic (e.g. 5 items / pageSize 2 → 3; 0 items → 1) is prime off-by-one territory and could break on any future edit with no signal.
**Suggested probe**: Assert `paginate([], 1, 10).totalPages === 1` and `paginate([1,2,3,4,5], 1, 2).totalPages === 3`.

### 3. Edge cases entirely unexercised: empty input, out-of-range page, non-divisible size
**Where**: `paginate.ts:14` (`all.slice(start, start+pageSize)`) — MISSING
**Why it matters**: No test covers empty array (`all=[]`), `pageNumber` beyond `totalPages` (should return `items: []`), or the last partial page when `pageSize` doesn't divide `all.length`. The `slice` masks out-of-range reads silently, so a bad `start` (as in finding #1) never throws — it returns wrong data. Without these cases, the function's failure mode is *silent wrong answers*, the hardest kind to catch downstream.
**Suggested probe**: Table test — `([], 1, 10) → items:[]`; `([1,2,3], 5, 2) → items:[]`; `([1,2,3], 2, 2) → items:[3]`.

### 4. No guard-path test for `pageSize = 0` / negative `pageNumber`
**Where**: `paginate.ts:12-13` — MISSING
**Why it matters**: `pageSize=0` yields `ceil(n/0)=Infinity` and a zero-width slice; negative `pageNumber` produces a negative `start` (which `slice` reinterprets from the array end — a data-leak-shaped bug). No `throw`/validation exists in source and no test asserts either the current (undefined) behavior or a desired guard. If a validation branch is later added, there's no test to confirm it fires.
**Suggested probe**: Decide the contract, then assert it — e.g. `expect(() => paginate([1], 0, 0)).toThrow()` or pin the documented no-throw behavior so future guards are testable.
