# Evals — sdr

Executable behavioral evals for this skill. Schema, runner usage, and
assertion-type rubric live in [`tests/EVALS.md`](../../../tests/EVALS.md).

## Authoring the first eval

The scaffold deliberately ships **without** an `evals.json` — the runner
rejects an empty `evals: []` array, so an empty stub would break
`bun run tests/eval-runner-v2.ts` for every fresh skill.

When you're ready to author the first eval, create `evals.json` next to
this README. The snippet below models the four structural-tier assertion
types from ADR #0005 — copy and adapt:

```json
{
  "skill": "sdr",
  "description": "Executable evals for the sdr skill. Each eval shells `claude --print` and runs assertions against the stream-json transcript.",
  "_contract_note": "If this skill enforces a HARD-GATE rule, target ≥4 structural assertions covering: skill_invoked, tool_input_matches (canonical surface), regex (required output shape), not_regex (forbidden bypass). See ADR #0005 for discriminating-signal coverage.",
  "evals": [
    {
      "name": "first-eval",
      "summary": "what regression this guards",
      "prompt": "<verbatim user prompt that should fire this skill>",
      "assertions": [
        { "type": "skill_invoked", "skill": "sdr", "description": "skill fires on the trigger" },
        { "type": "tool_input_matches", "tool": "Skill", "input_key": "skill", "input_value": "sdr", "tier": "required", "description": "Skill tool surface contract — pins name + input_key + input_value" },
        { "type": "regex", "pattern": "<expected output shape>", "flags": "i", "description": "required output marker — distinguishes engaged-with-skill from drive-by mention" },
        { "type": "not_regex", "pattern": "<forbidden bypass shape>", "flags": "i", "description": "forbids skip-the-skill failure mode" }
      ]
    }
  ]
}
```

For multi-turn behavioral evals (chained prompts via `claude --print
--resume`), use the `turns[]` + `final_assertions` shape documented in
[`tests/EVALS.md`](../../../tests/EVALS.md). DTP's evals are the reference.

`validate.fish` will warn on the missing file until you create it —
that's the intended discovery path.

## Run

```fish
bun run tests/eval-runner-v2.ts sdr
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
