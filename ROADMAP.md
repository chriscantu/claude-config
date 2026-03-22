# Claude Config Roadmap

Track record and roadmap for skills, agents, and hooks.

## Shipped

| Item | Type | Description |
|------|------|-------------|
| `/adr` | Skill | Create, list, supersede ADRs using system-design-records conventions |
| `/new-project` | Skill | Scaffold repos with CLAUDE.md, test config, and git setup |
| `/cross-project` | Skill | Analyze cross-repo impact of changes across `~/repos/` |
| `/tech-radar` | Skill | Manage tool/framework adoption entries (Assess → Trial → Adopt → Hold) |
| `/tenet-exception` | Skill | Create engineering tenet exception requests with PR process guidance |
| `platform-reviewer` | Agent | Reviews for API stability, operational burden, cross-team dependencies |
| Sensitive file guard | Hook | Block edits to `.env`, lock files, credentials *(configured in `~/.claude/settings.json`)* |
| Verification gate | Hook | Prevent Claude from finishing without running tests/type-check *(configured in `~/.claude/settings.json`)* |

## Planned

### Skills

| Priority | Item | Description |
|----------|------|-------------|
| 1 | `/sdr` | Unified skill for all SDR types — System Overview, Service/Component Creation, Data Design, Blueprint. Routes to the correct template based on the decision scope. |
| 2 | `/onboard` | Generate codebase onboarding guides from repo structure, CLAUDE.md, and package config. Output as markdown (Confluence-ready). |
| 3 | `/build-vs-buy` | Structured procurement decision framework. The system-design-records template is currently TODO — this skill would also define the framework. |

### Agents

| Priority | Item | Description |
|----------|------|-------------|
| 1 | `decision-challenger` | Devil's advocate for ADRs, SDRs, and tech radar entries. Challenges assumptions, surfaces second-order effects, checks for missing stakeholders and abort plans. |

### Hooks

| Priority | Item | Description |
|----------|------|-------------|
| 1 | Confluence publish reminder | PostToolUse hook on commits to system-design-records — remind to update the corresponding Confluence page. |
| 2 | Tenet compliance check | PreToolUse hook when editing architecture docs — prompt Claude to check alignment with engineering tenets. |
