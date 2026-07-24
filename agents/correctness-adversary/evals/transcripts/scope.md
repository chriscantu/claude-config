# Scope Adversary — main_@7beb33e

**Diff scope**: 1 file, +16 LOC (new file `paginate.ts`)
**Inferred task**: Add a generic `paginate` helper that returns the 1-indexed page of an array.

Diff is a clean single-file baseline addition. Every line but one traces to the stated helper. One marginal scope signal below; I'm not padding to hit a count.

## Findings (ranked, worst first)

### 1. `totalPages` metadata exceeds the function's own stated purpose
**Where**: `paginate.ts:3` (`totalPages: number;`), `paginate.ts:11` (`const totalPages = Math.max(1, Math.ceil(all.length / pageSize));`), `paginate.ts:14` (returned)
**Why it matters**: The docstring (lines 7-9) scopes the function to *"Return the 1-indexed page `pageNumber` of `all`"* — i.e. the slice of items. `totalPages` is additional pagination metadata that the stated purpose never asks for, computed and threaded into the return shape. It has no consumer in the diff (new file, no callers) and isn't mentioned in the contract the docstring establishes. This is the one field that doesn't trace to "return page N" — a Karpathy #2 surface added on spec, not on request. If the task was genuinely "page slice," `totalPages` is smuggled surface; if it was "pagination envelope," the docstring is under-specified. Either way there's a scope/spec mismatch on this line.
**Suggested probe**: Confirm no caller reads `.totalPages` (`grep -rn "totalPages" .` → only the definition). Check whether the task/issue text requested total-page reporting; if not, drop the field or extend the docstring to name it as intended surface.

---

**Not my lane (flagging boundary only, not scoring)**: `pageNumber` echoed back unvalidated and the `totalPages`-vs-`pageNumber` relationship are correctness concerns — deferred to the correctness worker. Export-without-caller is expected for a library baseline helper and is **not** counted as dead-code drift here.
