# Evals — SKILL_NAME

Executable behavioral evals for this skill. Schema, runner usage, and
assertion-type rubric live in [`tests/EVALS.md`](../../../tests/EVALS.md).

## Run

```fish
bun run tests/eval-runner-v2.ts SKILL_NAME
bun run tests/eval-runner-v2.ts --dry-run    # validate JSON + regex compile only
```

## Authoring checklist

- [ ] At least one eval before promoting `status: experimental` → `stable`
- [ ] If skill enforces a HARD-GATE rule: ≥4 structural assertions
      (skill_invoked, tool_input_matches, regex, not_regex) per
      [ADR #0005](../../../adrs/0005-behavioral-adr-promotion-requires-discriminating-signal.md)
- [ ] No trigger overlap with adjacent skills (audit per #73)
- [ ] `_contract_note` updated if assertions pin upstream tool surfaces

See `skills/define-the-problem/evals/evals.json` for a battle-tested example.
