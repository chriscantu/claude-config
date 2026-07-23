# Security Adversary — main_@7beb33e

**Diff scope**: 1 file, +1/−1 LOC (`paginate.ts`)

No security findings.

The change is a single arithmetic edit inside `paginate` (`start = (pageNumber - 1) * pageSize` → `pageNumber * pageSize`). This is a correctness regression (off-by-one vs. the documented 1-indexing), not a security defect — that's correctness-worker territory.

No injection sink, no credential, no auth/authz boundary, no crypto, and no new dependency is touched by the diff. The `pageNumber`/`pageSize` parameters remain unvalidated, but that condition pre-exists the diff (a negative `pageNumber` already produced a negative `slice` index before this change), so there is no diff-introduced attack path to report per contract.
