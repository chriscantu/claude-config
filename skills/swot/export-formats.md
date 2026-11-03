# SWOT — Export Formats

After rendering the review report, offer export options:

> "Export this SWOT? Choose a format:
> 1. [Markdown] — standalone doc to docs/swot/
> 2. [Grid page] — 2x2 SWOT grid as a private Artifact page
> 3. [Presentation] — Slidev deck via /present
> 4. [All] — generate all three
> Or skip to continue without exporting."

Each format is independent. Generate sequentially. User can pick one or more.

## Markdown Export

Write point-in-time snapshot to `docs/swot/YYYY-MM-DD-<org-name-sanitized>.md`
(same sanitization as pending-sync filenames). Same structure as review report.
This is the artifact downstream skills (`/strategy-doc`, `/okr`) consume.

## Grid Page Export

Publish a classic 2x2 SWOT grid with the built-in Artifact tool. The page is
private to the user until they share it. Unlike stakeholder-map, SWOT may
publish: its entries are meant to describe the organization, and they are
written for the committed Markdown export in `docs/swot/`.

Entries drafted from 1:1 notes (`--from=1on1-prep`) can still name or judge a
person, for example "VP X blocks platform work". Before publishing, check every
entry. If any names or assesses an individual, list those entries and ask the
user to reword them, drop them, or keep the page local (step 5) instead.

Write entries as the people who'll read them would: accented names, real
punctuation and non-English words are fine. The Artifact tool wraps the page
with a UTF-8 charset, so nothing needs to be flattened to ASCII.

| Part | Class | Look |
|------|-------|------|
| The 2x2 grid | `grid` | two columns, 2px outline |
| One quadrant | `q` | 1px border |
| Helps/hurts line under a heading | `side` | muted |
| Landscape tag at the start of an entry | `tag` | muted |

**Steps**:
1. Copy `assets/swot-template.html` to the scratchpad as
   `swot-<org-name-sanitized>.html` (same sanitization as the Markdown export).
   HTML-escape `&`, `<`, `>` and `"` in every value you insert in the steps
   below, the org name included.
2. Replace `Org Name` in the `<title>` and the heading.
3. Fill each quadrant (Strengths, Weaknesses, Opportunities, Threats) with its
   observations. Each entry is one line:
   `<li><span class="tag">[{tag}]</span> {observation text}</li>`. The text is
   the observation body only, without its date or provenance. Order entries by
   tag alphabetically, then keep the review report's order within a tag. If a
   quadrant has more than 8 entries, show the first 8 in that order, then one
   last `<li>` reading `... and M more`, where M is the number left out. A
   quadrant with no entries gets one `<li>None recorded</li>`. Keep the
   headings and the helps/hurts lines as the template has them.
4. Publish it with the Artifact tool (`icon: "grid"` on the first publish), and
   tell the user the link. To refresh it in a later run, keep the same link:
   list artifacts (`action: "list"`, `limit: 200`), find the ones titled
   `SWOT: <Org Name>`, and take the most recently updated. Read it
   (`action: "read"`), then publish the new file with `url` set to that link.
   If none is listed, publish a new page.
5. If the Artifact tool isn't available, add `<!doctype html><meta charset="utf-8">`
   as the first line, so accented text reads correctly, then open the file
   locally with `open <file>`.

## Presentation Export

Invoke `/present` with brief:

```
Create a presentation titled "Landscape Assessment: <Org Name>"

Slide structure:
1. Title slide with date
2. Internal Strengths — bulleted list with evidence citations
3. Internal Weaknesses — bulleted list with evidence citations
4. External Opportunities — bulleted list with evidence citations
5. External Threats — bulleted list with evidence citations
6. Coverage Gaps & Recommended Next Steps

Professional theme. Each bullet includes landscape tag and provenance.
```
