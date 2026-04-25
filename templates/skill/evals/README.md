# Evals — SKILL_NAME

Executable behavioral evals for this skill. Schema, runner usage, and
assertion-type rubric live in [`tests/EVALS.md`](../../../tests/EVALS.md).

## Authoring the first eval

The scaffold deliberately ships **without** an `evals.json` — the runner
rejects an empty `evals: []` array, so an empty stub would break
`bun run tests/eval-runner-v2.ts` for every fresh skill.

When you're ready to author the first eval, create `evals.json` next to
this README:

```json
{
  "skill": "SKILL_NAME",
  "description": "Executable evals for the SKILL_NAME skill. Each eval shells `claude --print` and runs assertions against the stream-json transcript.",
  "_contract_note": "If this skill enforces a HARD-GATE rule, target ≥4 structural assertions covering: skill_invoked, tool_input_matches (canonical surface), regex (required output shape), not_regex (forbidden bypass). See ADR #0005 for discriminating-signal coverage.",
  "evals": [
    {
      "name": "first-eval",
      "summary": "what regression this guards",
      "prompt": "<verbatim user prompt>",
      "assertions": [
        { "type": "skill_invoked", "skill": "SKILL_NAME", "description": "skill fires on the trigger" }
      ]
    }
  ]
}
```

`validate.fish` will warn on the missing file until then — that's the
intended discovery path.

## Run

```fish
bun run tests/eval-runner-v2.ts SKILL_NAME
bun run tests/eval-runner-v2.ts --dry-run    # validate JSON + regex compile only
```

## Authoring checklist

- [ ] At least one eval before promoting `status: experimental` → `stable`
- [ ] If the skill enforces a HARD-GATE rule: ≥4 structural assertions
      (`skill_invoked`, `tool_input_matches`, `regex`, `not_regex`) per
      [ADR #0005](../../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md)
- [ ] No trigger overlap with adjacent skills (audit per #73)
- [ ] `_contract_note` updated if assertions pin upstream tool surfaces

See `skills/define-the-problem/evals/evals.json` for a battle-tested example.
