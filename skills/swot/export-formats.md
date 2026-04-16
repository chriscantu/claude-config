# SWOT — Export Formats

After rendering the review report, offer export options:

> "Export this SWOT? Choose a format:
> 1. [Markdown] — standalone doc to docs/swot/
> 2. [Excalidraw] — 2x2 SWOT grid on the canvas
> 3. [Presentation] — Slidev deck via /present
> 4. [All] — generate all three
> Or skip to continue without exporting."

Each format is independent. Generate sequentially. User can pick one or more.

## Markdown Export

Write point-in-time snapshot to `docs/swot/YYYY-MM-DD-<org-name-sanitized>.md`
(same sanitization as pending-sync filenames). Same structure as review report.
This is the artifact downstream skills (`/strategy-doc`, `/okr`) consume.

## Excalidraw Export

Render a classic 2x2 SWOT grid on the excalidraw canvas.

**Prerequisites**: Check `mcp__excalidraw__*` tools. If unavailable, skip with message.

**Layout**:

```
+-------------------------+-------------------------+
|       STRENGTHS         |       WEAKNESSES        |
|     (internal +)        |     (internal -)        |
|  [technical] entry 1    |  [technical] entry 1    |
|  [cultural] entry 2     |  [org] entry 2          |
+-------------------------+-------------------------+
|     OPPORTUNITIES       |        THREATS          |
|     (external +)        |     (external -)        |
|  [market] entry 1       |  [market] entry 1       |
|  [technical] entry 2    |  [org] entry 2          |
+-------------------------+-------------------------+
```

**Drawing steps**:
1. Warn before clearing canvas. If declined, skip.
2. Four quadrant rectangles via `batch_create_elements` — outline-only, 2x2 grid
3. Quadrant titles: "STRENGTHS (internal +)", etc.
4. Observations grouped by landscape tag per quadrant, fontSize ≥ 14. Truncate with
   "... and M more" if needed.
5. Title above grid: "SWOT Landscape: <Org Name>"
6. `set_viewport({ scrollToContent: true })`

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
