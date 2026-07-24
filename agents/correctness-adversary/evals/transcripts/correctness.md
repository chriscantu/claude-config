# Correctness Adversary — main@7beb33e

**Diff scope**: 1 file, +1/−1 LOC (`paginate.ts`, working-tree change)

## Findings (ranked, worst first)

### 1. Off-by-one: every page returns the *next* page's data
**Where**: `paginate.ts:13`
**Why it matters**: The docstring (lines 8–9) declares pages 1-indexed — "page 1 is the first `pageSize` items, i.e. `all[0 .. pageSize)`". The diff changed `start = (pageNumber - 1) * pageSize` → `start = pageNumber * pageSize`. Now `paginate(all, 1, 10)` computes `start = 10` and returns `all[10..20)` — the second page. The entire first page (`all[0..10)`) is **unreachable** by any caller, and every requested page is shifted forward by one. This is silent corruption: no throw, plausible-looking non-empty array, wrong records.
**Suggested probe**: `paginate(['a','b','c'], 1, 2)` → expect `items === ['a','b']`; actual `['c']`. Assert `paginate(list,1,size).items[0] === list[0]`.

### 2. Last page silently returns empty items while `totalPages` still reports it exists
**Where**: `paginate.ts:12–15`
**Why it matters**: Consequence of the same shift. With `all.length = 3`, `pageSize = 2` → `totalPages = 2`. A caller iterating `pageNumber` from 1..`totalPages` requests page 2: `start = 2*2 = 4`, `slice(4,6)` → `[]`. The last legitimate page comes back empty, and the returned `Page.pageNumber` still echoes the requested number — metadata says "page 2 of 2" but items are empty. UI/consumer sees "no results" for a page the same response claims exists.
**Suggested probe**: For `paginate(['a','b','c'], 2, 2)` expect `items === ['c']`; actual `[]`. Loop `1..totalPages` and assert concatenated items equal `all`.

Note (pre-existing, not introduced by this diff — flagging, not attributing): `pageSize === 0` yields `Math.ceil(n/0) = Infinity` → `totalPages = Infinity`. Out of diff scope.
