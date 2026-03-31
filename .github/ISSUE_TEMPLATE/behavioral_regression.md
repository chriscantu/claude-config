---
name: Behavioral Regression
about: Claude skipped a required behavior (verification, planning stage, etc.)
labels: regression, behavioral
---

## Which behavior was skipped?

[e.g., "Claude skipped systems analysis and jumped straight to solution design"]

## Which rule or skill should have enforced it?

[e.g., `rules/planning.md` HARD-GATE, `rules/verification.md`]

## Prompt that triggered the regression

```
[Paste the prompt you gave Claude]
```

## Claude's response (relevant excerpt)

```
[What Claude actually did]
```

## Expected behavior

What Claude should have done instead.

## Does `validate.fish` catch this?

- [ ] Yes — validation passes but behavior is still wrong (eval gap)
- [ ] No — the concept is missing from `tests/required-concepts.txt`
- [ ] Not sure
