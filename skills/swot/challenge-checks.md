# SWOT — Challenge Checks

Four quality checks run in challenge mode (`--mode=challenge`) or after a capture
when the user accepts the offer.

Read entity: `mcp__memory__open_nodes({ names: ["<Org Name> SWOT"] })`

## Check 1: Specific?

Rejects vague entries that could apply to any organization.

- "Strong engineering culture" — **fails**. What specifically? Measured how?
- "CI/CD deploys in 15 minutes with zero-downtime rolling updates" — **passes**

## Check 2: Evidence-backed?

Each observation should have provenance (text in parentheses at end).

- `(repo README)` / `(1:1 with Sarah)` / `(incident postmortem #47)` — **passes**
- No provenance — **flagged**. Ask: "How do you know this? What did you see or hear?"

## Check 3: Actionable?

Could a strategy or decision be informed by this entry?

- "Platform team has no SRE — devs carry pager" — **actionable** (hiring, reorg, process change)
- "The office has nice furniture" — **not actionable**, flag for removal

## Check 4: Correctly Categorized?

Internal vs. external alignment:

| If | Suggest |
|----|---------|
| `[strength]` describes external condition | → `[opportunity]` |
| `[threat]` describes internal gap | → `[weakness]` |
| `[weakness]` describes external pressure | → `[threat]` |
| `[opportunity]` describes internal capability | → `[strength]` |

## Output Format

```
## Challenge Results: <Org Name>

3 of 12 entries flagged:

1. [strength][cultural] "Strong engineering culture"
   -> NOT SPECIFIC. What behaviors or practices demonstrate this?
   [Edit] [Remove] [Keep anyway]

2. [opportunity][market] "AI is big right now"
   -> NOT ACTIONABLE. How specifically could this org exploit it?
   [Edit] [Remove] [Keep anyway]

3. [threat][org] "No dedicated SRE team"
   -> MISCATEGORIZED. This is internal, not external. Suggest: [weakness][org]
   [Recategorize] [Keep as-is]
```

## Acting on Flags

| Action | Behavior |
|--------|----------|
| **Edit** | User provides revised text. Delete old, write new. |
| **Remove** | Delete the observation. |
| **Keep anyway** | No change — user override. |
| **Recategorize** | Delete old, write new with corrected SWOT tag. |

Delete: `mcp__memory__delete_observations`. Write: `mcp__memory__add_observations`.
If either fails, warn and save to pending-sync.

Zero flags: "All entries passed the challenge. Your SWOT is looking solid."
