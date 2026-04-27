---
description: "Map the architecture landscape across multiple repos (issue #44)"
argument-hint: "[path-to-repos.yaml]"
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Write", "Edit", "Skill"]
---

# /architecture-overview

Invoke the `architecture-overview` skill to produce a whole-system landscape document from a list of repos. Output: inventory + dependency map + data flow + external integrations doc with code citations and flagged inferences.

## Arguments

`$ARGUMENTS` is an optional path to a repos config yaml. Defaults to `docs/onboarding/repos.yaml` when omitted.

Examples:

```
/architecture-overview
/architecture-overview docs/onboarding/repos.yaml
/architecture-overview ~/configs/acme-repos.yaml
```

## Workflow

1. Resolve config path (`$ARGUMENTS` → default `docs/onboarding/repos.yaml`).
2. If no config exists, offer to create one from `skills/architecture-overview/templates/repos.yaml.template`.
3. Invoke the `architecture-overview` skill via the Skill tool.

## See also

- `/onboard` (#12) — single-repo deep walk; runs AFTER architecture-overview prioritizes which repos merit it
- `/sdr` — authoring new system design records
- `/cross-project` — impact analysis of one specific change
