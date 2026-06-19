# SWOT — Capture Form & Parsing

Capture is **observation-first**: the user reports what they saw and against what
baseline; the skill proposes the S/W/O/T tag at the confirm step. The user never picks
a SWOT bucket at input time. This removes the bucketing bias that the challenge checks
otherwise have to clean up.

## The Capture Form

Present all six prompts in one message. None name a SWOT quadrant.

```
## SWOT Capture: <Org Name>

Tell me what you've actually observed — facts, not verdicts.
Answer what applies, skip the rest. One observation per line is fine.

1. **What did you observe?** — Something concrete you saw, heard, or read.
   What's happening, who's involved, what's the situation?

2. **How do you know?** — Where did this come from? (a 1:1, a doc, an
   incident, a metric, a meeting). Skip if it's just a hunch — say so.

3. **Compared to what?** — How does this stack up against competitors,
   peer teams, your last org, or the standard this business actually needs?

4. **What's missing?** — What would a healthy org of this size or stage have
   here that this one doesn't? (a role, a process, a tool, a guardrail)

5. **So what?** — If this holds, what does it help or hurt? (optional —
   leave blank and I'll infer)

6. **Anything else** — Context that matters but doesn't fit above.
```

Prompts 1–2 are the evidence core. Prompts **3 (comparative)** and **4 (absence)** are
the gap-finders: they surface weaknesses and threats against an external baseline
*without* asking the user to pre-label anything. Prompt 5 is optional so the form
doesn't read as an interrogation.

## Parsing Rules

- Treat each **line or bullet** under prompt 1 as one candidate observation. Its
  prompt 2–5 context attaches to that observation (provenance from 2, baseline from 3,
  so-what from 5).
- Prompts **3 and 4 may also spawn standalone observations** — a named comparison or a
  named absence is itself an observation ("no on-call rotation, peers all have one").
- Skip empty responses — no observation for blank prompts.
- Observation body = user's verbatim text (never summarize).
- **Unparseable input**: if there are no clear line breaks and you can't tell where one
  observation ends and the next begins, re-present the form and ask the user to put one
  observation per line. Do NOT invent splits.

## Auto-Tagging (deferred to confirm)

After parsing, propose one SWOT tag and one landscape tag per observation. Tagging is
LLM judgment, shown to the user for correction — never asked mid-capture.

**SWOT tag heuristic:**

| Signal in the observation | Proposed tag |
|---|---|
| Internal + the org controls it + positive vs. baseline | `[strength]` |
| Internal + the org controls it + gap / absence / negative vs. baseline | `[weakness]` |
| External force + upside the org could exploit | `[opportunity]` |
| External force + risk that could hurt the org | `[threat]` |
| Doesn't take a position / pure background | `[context]` (no SWOT valence) |

Prompt-3 ("compared to what") and prompt-4 ("what's missing") answers bias toward
`[weakness]` / `[threat]`, but never force it — an absence that is an industry tailwind
is an `[opportunity]`. Internal vs. external is the load-bearing split.

**Landscape tag** (best-effort, from the closed set `[technical]`, `[cultural]`,
`[market]`, `[org]`): assign by content keywords. If it doesn't clearly map, omit it.

## Provenance

Prompt 2 invites provenance inline. Do NOT gate on it — a blank prompt 2 is allowed and
the challenge pass flags missing evidence later. If provenance is missing and the
observation reads like it has a clear source, ask once:
> "Where did this come from? (e.g., '1:1 with Sarah', 'repo README'). Or say 'skip'."

Append provided provenance in parentheses at the end of the observation.

## Confirm & Auto-Tag

Show the proposed tags with a one-line rationale per row so a mis-tag is obvious and
cheap to fix. The categorization burden lives here, on the system + a glance, not on the
user at capture time.

```
## Tagged Observations Preview — <Org Name>

I sorted these for you. Check the tags; fix any I got wrong.

1. [weakness][org]    No SRE team — devs carry pager (1:1 with Sarah)
   -> tagged weakness: internal gap vs. "a healthy org would have an on-call rotation"
2. [threat][market]   Series-C rival raised $80M, hiring in our space (public filing)
   -> tagged threat: external force + "compared to" baseline
3. [opportunity][market] Rival dropped enterprise support — their customers shopping (sales)
   -> tagged opportunity: external upside

Confirm  ·  Retag N  ·  Edit N  ·  Cancel
```

- **Confirm** → write all (a correct auto-tag should need zero keystrokes)
- **Retag N** → flip just the SWOT tag; offer the quick pick `strength / weakness /
  opportunity / threat / context`, re-show, re-confirm
- **Edit N** → change observation text, landscape tag, or provenance; re-show, re-confirm
- **Cancel** → discard all, exit

## Write Flow

Write observations one at a time via `mcp__memory__add_observations` (best-effort, not
atomic). Track per-observation success/failure.

**Invariant — never persist an observation whose tag the user hasn't confirmed.** Tagging
is deferred in the *conversation* only; nothing is written until the user has seen and
confirmed the proposed tag at the preview. Every written observation matches the stored
shape in [graph-schema.md](graph-schema.md): SWOT entries carry
`[date][swot-tag][landscape-tag] text (provenance)`; `[context]` entries legitimately
carry only `[date][context] text (provenance)` (no SWOT valence, landscape optional). No
draft, unconfirmed, or proposal-state observation reaches the graph. This keeps the
stored format identical to prior entries, so review and challenge read new and old
observations the same way — no migration needed.

Report results:

```
## Write Results

Written: 3/3 observations
- [OK] [2026-05-01][weakness][org] No SRE team — devs carry pager (1:1 with Sarah)
- [OK] [2026-05-01][threat][market] Series-C rival raised $80M (public filing)
- [OK] [2026-05-01][opportunity][market] Rival dropped enterprise support (sales)
```

Failed writes → pending-sync (see [pending-sync.md](pending-sync.md)).

After write, offer challenge pass:
> "Want me to run a challenge pass on these new entries?"

## Artifact-Pointed Capture (`--read`)

1. Read artifact via Read tool (local path) or WebFetch (URL).
2. Extract signals — architectural decisions, tech debt, team structure, performance
   metrics, incident patterns, competitive references.
3. Format each as a draft observation, provenance set to the artifact source.
4. Present them in the **same auto-tag confirm flow above** — proposed tag + rationale.

Key constraint: never writes observations the user hasn't confirmed.

## Discovery Handoff (`--from=1on1-prep`)

Converts already-captured 1:1 discovery notes into SWOT observations without re-typing.
See [SKILL.md](SKILL.md) "Discovery Handoff" for the full flow. Summary:

1. Find `Person` entities via `mcp__memory__search_nodes` (named ones if the user passed
   names, else all — the graph has no Person→org link) and read their `[1on1]`
   observations.
2. Map each into a draft: the 1:1 text → observation body. 1on1-prep notes have no
   provenance parenthetical, so **synthesize** `(1:1 with <person>)` from the source
   entity. Strategic answers (biggest risk, most debt, who to know) often seed the
   comparative/absence framing.
3. Present the drafts in the **same auto-tag confirm flow above**. Nothing is written
   until the user confirms.
