---
description: "Map the architecture landscape across multiple repos (issue #44)"
argument-hint: "[path-to-repos.yaml]"
allowed-tools: ["Bash", "Read", "Glob", "Grep", "Write", "Skill"]
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
2. If no config exists, offer to scaffold one inline using the template content below — do NOT reference a relative path, since this command may be invoked from any cwd:

   ```yaml
   context:
     org: "Your Org Name"
     role: "Your Role"           # e.g., "VP Engineering"
     date_started: "YYYY-MM-DD"

   repos:
     - path: ~/repos/example-api
       purpose: "Public REST API"
       owner: "Platform team"
     - path: ~/repos/example-worker
   ```

3. Invoke the `architecture-overview` skill via the Skill tool — pass the resolved config path. Skill will re-validate paths and run the workflow.

## See also

- `/onboard` — single-repo deep walk; runs AFTER architecture-overview prioritizes which repos merit it
- `/sdr` — authoring new system design records
- `/cross-project` — impact analysis of one specific change
- `/swot` — organizational/people landscape (different domain)
