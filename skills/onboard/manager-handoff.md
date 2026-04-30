# Manager-Handoff Capture

Run this immediately after `bin/onboard-scaffold.fish` returns 0. The seed file at
`<target>/stakeholders/map.md` already has the four canonical section headers.

Ask the user (one section at a time):

1. **Direct reports** — names + roles. Append under `## Direct reports`.
2. **Cross-functional partners** — product, design, data, security counterparts. Append under `## Cross-functional partners`.
3. **Skip-level + leadership** — your manager, their manager, exec sponsor. Append under `## Skip-level + leadership`.
4. **Influencers** — anyone the manager flagged as "you should meet" who isn't above. Append under `## Influencers`.

Capture verbatim names + 1-line roles. Do NOT capture candid commentary here — that
belongs in `/1on1-prep` raw notes.

After capture, commit:

```fish
git -C <target> add stakeholders/map.md
git -C <target> commit -m "Seed stakeholder map from manager handoff"
```
