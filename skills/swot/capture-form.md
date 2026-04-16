# SWOT — Capture Form & Parsing

## The 5-Prompt Capture Form

Present all five prompts in one message:

```
## SWOT Capture: <Org Name>

Share what you've observed. Answer what applies, skip what doesn't.

**Internal (what the org controls)**
1. **Strengths** — What internal capabilities, assets, or advantages does the org have?
2. **Weaknesses** — What internal gaps, inefficiencies, or liabilities exist?

**External (what the org responds to)**
3. **Opportunities** — What market shifts, industry trends, or external conditions could the org exploit?
4. **Threats** — What external risks, competitive pressures, or environmental changes could hurt the org?

5. **Landscape context** — Anything that doesn't fit the quadrants but matters?
```

## Tag Mapping

| Prompt # | SWOT tag |
|----------|----------|
| 1 | `[strength]` |
| 2 | `[weakness]` |
| 3 | `[opportunity]` |
| 4 | `[threat]` |
| 5 | `[context]` |

## Parsing Rules

- Match responses by number prefix (`1. ...` or `1) ...`) or sequential paragraph order
- **Unparseable input**: If no numbers or clear breaks, re-present the form and ask
  the user to slot responses by number. Do NOT interpret content into buckets.
- Skip empty responses — no observation for blank prompts
- Each non-empty response = exactly one observation (don't split multi-sentence answers)
- Observation body = user's verbatim text (never summarize)

## Landscape Tag Assignment

After parsing, add a landscape tag based on content keywords from the closed set:
`[technical]`, `[cultural]`, `[market]`, `[org]`. This is best-effort LLM judgment —
not deterministic. If content doesn't clearly map to one dimension, omit the tag.
User can override in the confirm step.

## Provenance

After tagging, ask for provenance if not already in the observation text:
> "Where did each observation come from? (e.g., '1:1 with Sarah', 'repo README',
> 'incident postmortem'). I'll add source tags. Or say 'skip' to leave them off."

If provided, append in parentheses. If skipped, proceed — the challenge pass will
flag missing provenance later.

## Confirm & Tag

Show tagged observations for review before writing:

```
## Tagged Observations Preview

I'll write these observations to <Org Name>'s SWOT record:

1. [2026-05-01][strength][technical] CI/CD deploys in 15 min, zero-downtime (repo README)
2. [2026-05-01][weakness][org] No SRE team — devs carry pager (1:1 with Sarah)
3. [2026-05-01][opportunity][market] Competitor dropped enterprise support (sales team)

Does this look right? You can **confirm**, **edit**, or **cancel**.
```

- **confirm** → write to graph
- **edit** → ask which to change (text, SWOT tag, landscape tag, or provenance), show edited version, re-confirm
- **cancel** → discard all, exit

## Write Flow

Write observations one at a time via `mcp__memory__add_observations` (best-effort,
not atomic). Track per-observation success/failure. Report results:

```
## Write Results

Written: 3/3 observations
- [OK] [2026-05-01][strength][technical] CI/CD deploys in 15 min (repo README)
- [OK] [2026-05-01][weakness][org] No SRE team — devs carry pager (1:1 with Sarah)
- [OK] [2026-05-01][opportunity][market] Competitor dropped enterprise support (sales team)
```

Failed writes → pending-sync (see [pending-sync.md](pending-sync.md)).

After write, offer challenge pass:
> "Want me to run a challenge pass on these new entries?"

## Artifact-Pointed Capture (`--read`)

1. Read artifact via Read tool (local path) or WebFetch (URL)
2. Extract signals — look for: architectural decisions, tech debt, team structure,
   performance metrics, incident patterns, competitive references
3. Format each as a draft observation with proposed SWOT tag, landscape tag, and
   provenance set to the artifact source
4. Present in the same confirm flow above

Key constraint: never writes observations the user hasn't confirmed.
