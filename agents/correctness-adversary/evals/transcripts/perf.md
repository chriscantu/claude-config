# Perf Adversary — main_@7beb33e

**Diff scope**: 1 file, +16 LOC (`paginate.ts`)

## Findings (ranked, worst first)

### 1. API forces full-dataset materialization to return one page
**Where**: `paginate.ts:11` — `paginate<T>(all: T[], ...)`
**Why it matters**: The signature takes an already-materialized `T[]`. To return `pageSize` items, every caller must first load **all N** rows into memory. If this backs a DB table or API response, that's O(n) memory + O(n) transfer/deserialize per request to hand back a constant-size slice — pagination that defeats the purpose of pagination. Scaling cliff hits the moment `all` is a query result rather than a small in-memory list (n=100k rows → 100k objects allocated to serve 20). Offset/limit or cursor pushed to the data source is the standard fix; this helper structurally can't do that.
**Suggested probe**: Grep callers for how `all` is produced. `rg 'paginate\(' -A2`. If any caller passes a `.find()`/`SELECT *` result, benchmark heap + latency at n=1k vs n=100k: `node --prof` on a page-1 request against a synthetic 100k array.

### 2. Repeated paging re-materializes the whole set → O(n²/pageSize)
**Where**: `paginate.ts:14` — `all.slice(start, start + pageSize)`
**Why it matters**: `slice` itself is fine (O(pageSize) copy). The cliff is behavioral: a caller walking every page (page 1..totalPages) that re-fetches/re-builds `all` each call pays O(n) to build the set × n/pageSize calls = **O(n²/pageSize)** total. Even if `all` is cached in-memory, a "load all then slice" loop is O(n·pages) of redundant retained allocation. Nothing in the signature discourages this loop shape.
**Suggested probe**: Look for `for`/`while` loops incrementing `pageNumber` around a `paginate(` call. Benchmark full-walk of a 50k-item source at pageSize=20 (2500 calls); watch for quadratic wall-time growth as n doubles.

_No further findings — 16-LOC pure function; remaining behavior (bounds, slice copy) is constant-factor and not a hot-path concern absent caller evidence._
