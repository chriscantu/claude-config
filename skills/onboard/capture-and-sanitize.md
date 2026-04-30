# Capture & Sanitize — Phase 3 (Q1-B Wrapper Flow)

`/1on1-prep` is unchanged. `/onboard --capture` wraps it: delegate the
memory-graph write to `/1on1-prep`, then run the /onboard-owned tag-and-store
flow that prompts per-observation `attributable | aggregate-only | redact` and
writes the tagged markdown to `<workspace>/interviews/raw/`.

## `/onboard --capture <person>` flow

1. Verify caller is inside an /onboard workspace (parent directory contains
   `RAMP.md`). If not, abort with: "—capture must run from inside an /onboard
   workspace; cd to the workspace root first."

2. Invoke `/1on1-prep <person> --phase=capture` and let it run its standard
   6-prompt form. The memory-graph write is the user's existing canonical
   record.

   **Note on `disable-model-invocation: true`** — `/1on1-prep`'s frontmatter
   blocks the *model* from autonomously triggering the skill via heuristic
   match. It does NOT block explicit user-issued (or wrapper-issued)
   `/1on1-prep <person> --phase=capture` invocations. The wrapper invocation
   is explicit and proceeds normally.

3. After /1on1-prep returns the tagged-observation preview (the
   `## Tagged Observations Preview` block in `skills/1on1-prep/capture-form.md`),
   present a per-observation sanitization-tag prompt:

       For each observation above, choose:
         a) attributable     — verbatim, with explicit consent to attribute
         b) aggregate-only   — themes only, will be anonymized in sanitized/
         c) redact           — stays in raw/ only; never emitted to sanitized/

       Reply with one letter per numbered observation, e.g. "1b 2c 3a 4b".

4. Validate the response: one of `a|b|c` per observation, no missing entries.
   Re-prompt on parse failure.

5. Compose the raw markdown file:

       <workspace>/interviews/raw/<YYYY-MM-DD>-<person-slug>.md

   Format:

       # 1:1 with <Person> — <YYYY-MM-DD>

       ## Observations

       1. [attributable] <verbatim text from observation 1>
       2. [aggregate-only] <verbatim text from observation 2>
       3. [redact] <verbatim text from observation 3>
       ...

6. Write the file. Do NOT git-add — `interviews/raw/` is gitignored by Phase 1
   scaffold; the file stays local. Print the path so the user can confirm.

7. Remind the user: "Run /onboard --sanitize <workspace> when ready to emit
   sanitized themes for /swot / /present consumption."

## `/onboard --sanitize <workspace>` flow

1. Verify `<workspace>/interviews/raw/` exists. If empty, exit with "no raw
   notes to sanitize."

2. For each `*.md` file in `interviews/raw/`:

   a. Parse observations matching `^\d+\.\s+\[(attributable|aggregate-only|redact)\]\s+(.+)$`.

   b. Group by tag:
      - `attributable` → emit as-is (with the verbatim text + person attribution
        in a header). Requires explicit consent already captured at tag time.
      - `aggregate-only` → emit with attribution stripped, prefixed with the
        canonical aggregate framing ("multiple engineering leaders noted ...").
        Person name MUST NOT appear in the sanitized output.
      - `redact` → SKIP. Stays in raw/ only.

3. Write the sanitized output to:

       <workspace>/interviews/sanitized/<YYYY-MM-DD>-<person-slug>.md

   Format:

       # Sanitized themes — <YYYY-MM-DD>

       ## Attributable observations

       (only if attributable tags present; each line includes person attribution)

       ## Aggregate-only themes

       - Multiple engineering leaders noted: <verbatim text>
       - Multiple engineering leaders noted: <verbatim text>

4. Run a final sanity check: scan the emitted sanitized file for the source
   person's name (split on whitespace, regex `\b<first>\b|\b<last>\b`). If any
   match in the `## Aggregate-only themes` section, abort and surface the
   source observation — user must re-tag (likely meant `redact`).

5. git-add and commit the sanitized file:

       git -C <workspace> add interviews/sanitized/<filename>
       git -C <workspace> commit -m "Sanitized themes from <YYYY-MM-DD> 1:1"

## What this flow deliberately does NOT do

- Modify `/1on1-prep` SKILL.md or capture-form.md (Q1-B decision).
- Auto-tag observations by content heuristics — tags are user-driven per spec
  ("user tags every observation"). Auto-tagging would re-introduce the leak class.
- Sanitize across multiple raw files into a single themes file (Phase 4 — would
  benefit from cross-1:1 theme clustering, currently out of scope).
