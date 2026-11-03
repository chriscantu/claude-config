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
private to the user until they share it.

**Steps**:
1. Copy `assets/swot-template.html` to the scratchpad as
   `swot-<org-name-sanitized>.html` (same sanitization as the Markdown export).
2. Replace `Org Name` in the `<title>` and the heading.
3. Fill each quadrant (Strengths, Weaknesses, Opportunities, Threats) with its
   observations, grouped by landscape tag (`[technical]`, `[org]`, `[market]`, ...).
   Past about 8 entries in a quadrant, end with "... and M more".
4. Publish it with the Artifact tool (`icon: "grid"`). To refresh it later, edit
   the same file and publish again, so the link stays the same.
5. If the Artifact tool isn't available, open the file locally with `open <file>`.

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
