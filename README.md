# claude-config

*Claude Code, configured as your strategic engineering thought partner.*

**The problem:** Claude Code is powerful out of the box, but without guardrails it skips straight to implementation. It doesn't decompose problems, doesn't consider trade-offs, doesn't verify its work, and doesn't think about organizational impact. You end up with code that compiles but misses the point.

**What this gives you:** A set of rules, skills, and agents that enforce a deliberate workflow — from problem definition through design sketching to verified implementation. Claude still does the work; it just thinks before it acts.

## Install

```sh
git clone https://github.com/chriscantu/claude-config.git ~/repos/claude-config
cd ~/repos/claude-config

# bash/zsh
bash install.sh

# fish
fish install.fish
```

Both scripts do the same thing: symlink everything into `~/.claude/`. Existing files are backed up with a `.bak` extension. Re-running is safe — symlinks are replaced, not duplicated.

### Post-Install: Customize `global/CLAUDE.md`

The global config ships with opinionated defaults (shell preferences, language defaults, communication style). **Edit `global/CLAUDE.md` to match your environment** — it's the one file you should personalize.

On your next Claude Code session, ask Claude to build something. You'll see it stop and ask you to define the problem before writing a line of code.

## See it in action

A VP asks Claude to add a new billing tier to the platform. Without this config, Claude starts writing code. With it:

1. **Problem Definition** — Claude asks: *Who is this tier for? What behavior changes? What does success look like?*
2. **Systems Analysis** — Claude maps what's affected: billing service, entitlements, usage reporting, downstream teams
3. **Trade-off presentation** — Claude surfaces 2-3 approaches with organizational implications, not just technical ones
4. **Sketch before design** — Claude produces a structural sketch before writing a single line
5. **Verified implementation** — Tests run before Claude declares the work done

## What's Included

Rules run automatically and shape how Claude approaches every session. Skills are invoked on demand for specific workflows. Agents are specialized reviewers you bring in at key moments.

### Rules (always active)

| Rule | What it enforces |
|------|-----------------|
| **planning** | Enforces the mandatory planning pipeline: problem definition → systems analysis → brainstorming → fat-marker sketch → detailed design. Thin gate rule that delegates to skills for each stage. Announces stage transitions so you always know where you are. |
| **fat-marker-sketch** | After selecting an approach, Claude must produce a crude visual sketch (rendered as HTML with bordered boxes) before detailed design. Forces structural conversation before pixel-level detail. |
| **tdd-pragmatic** | Test-first for non-trivial logic, tests alongside for simple code. Every bug fix starts with a reproducing test. |
| **verification** | Claude must run tests or type-checks before claiming work is complete. No "this should work" — prove it. |

### Skills (on-demand slash commands)

Skills are invoked with `/skill-name` and guide Claude through structured processes.

| Skill | Purpose |
|-------|---------|
| `/define-the-problem` | Front door to the planning pipeline. Ensures every feature starts with a clear user problem — not a solution, not a feature request. Hands off to `/systems-analysis` when complete. |
| `/systems-analysis` | Maps dependencies, second-order effects, failure modes, and organizational impact. Bridge between problem definition and solution design. |
| `/adr` | Create, list, or supersede architectural decision records following system-design-records conventions. |
| `/new-project` | Scaffold a new repo with CLAUDE.md, test config, and git setup for your chosen stack (TypeScript, Python, Swift, docs). |
| `/cross-project` | Analyze how a change in the current repo affects other local repositories. Scans `~/repos/` for dependents. |
| `/tech-radar` | Manage technology adoption entries (Assess → Trial → Adopt → Hold) with structured evaluation criteria. |
| `/tenet-exception` | Create engineering tenet exception requests with proper justification and PR process guidance. |
| `/fat-marker-sketch` | Produce a crude structural sketch — invoked automatically by the planning rule, but can also be called directly. |
| `/present` | Create professional presentations using Slidev + Bun. Takes a brief, draft, or existing slides → live preview → PDF/PPTX export. Source-controllable Markdown. |
| `/1on1-prep` | Prepare for and capture 1:1 meetings with structured output. Pulls context from memory, surfaces discussion topics, and writes meeting notes back to the knowledge graph. |
| `/stakeholder-map` | Build a stakeholder / political-topology map for a new leadership role (leader-onboarding) and audit coverage gaps + echo-chamber signals (coverage-review). Extends the memory graph shared with `/1on1-prep`; renders a chart and heatmap via excalidraw. |
| `/swot` | Accumulative SWOT landscape analysis for onboarding. Captures observations to the knowledge graph across sessions, with challenge pass for quality and multi-format export (markdown, excalidraw, presentation). |

### Agents (specialized reviewers)

| Agent | Purpose |
|-------|---------|
| **platform-reviewer** | Reviews code changes for API contract stability, backward compatibility, operational burden, and cross-team impact. |
| **security-reviewer** | Reviews code changes for security vulnerabilities — OWASP categories, credential exposure, input validation, auth/authz boundaries, and dependency risks. |
| **decision-challenger** | Devil's advocate for ADRs, SDRs, and tech radar entries. Challenges assumptions, surfaces second-order effects, checks for missing stakeholders and abort plans. |

### Templates

| Template | Purpose |
|----------|---------|
| **PROJECT-CLAUDE-MD.md** | Drop-in template for per-repo CLAUDE.md files. Covers project purpose, architecture, commands, conventions, domain glossary, and non-obvious decisions. |

> **What this is not:** This isn't a replacement for engineering judgment — it's a forcing function. Claude still gets things wrong. The config makes it wrong less often, and in more visible ways.

## The Workflow

These pieces compose into a deliberate design pipeline:

```mermaid
flowchart LR
    A["/define-the-problem"] --> B["/systems-analysis"]
    B --> C["brainstorming"]
    C --> D["/fat-marker-sketch"]
    D --> E["detailed design"]
    E --> F["TDD implementation"]
    F --> G["verification"]

    style A fill:#4a90d9,color:#fff,stroke:none
    style B fill:#4a90d9,color:#fff,stroke:none
    style C fill:#7b68ee,color:#fff,stroke:none
    style D fill:#7b68ee,color:#fff,stroke:none
    style E fill:#5ba85a,color:#fff,stroke:none
    style F fill:#5ba85a,color:#fff,stroke:none
    style G fill:#e67e22,color:#fff,stroke:none
```

You can enter at any point — the rules enforce the upstream steps automatically. Start building a feature and Claude will decompose the problem first. Select an approach and Claude will sketch before designing. Write code and Claude will verify before declaring done.

## Runtime Bypass Flags

The `planning` rule enforces a **pressure-framing floor**: when Claude detects deadline pressure, authority invocations, or fatigue framings (*"ship by Friday"*, *"my VP approved this"*, *"I'm tired — just give me code"*), it routes to `/define-the-problem` rather than honoring a skip request. These are exactly the moments the planning pipeline is most valuable.

If the floor misfires for your workflow — for example, you're running a demo, or the rule is catching a framing it shouldn't — you can disable it at runtime with a sentinel file.

> **Bug vs. bypass.** If the misfire is reproducible and not specific to your local workflow (same prompt routes to DTP across fresh sessions), that's a bug — file an issue with a reproduction rather than leaving the bypass on. The bypass is a runtime rollback, not a silent alternative to fixing the rule.

### Disabling the pressure-framing floor

Create an empty file at either location (project-scoped is checked first):

```sh
# Project-scoped
touch .claude/DISABLE_PRESSURE_FLOOR

# Or global
touch ~/.claude/DISABLE_PRESSURE_FLOOR
```

File existence alone triggers the bypass — content is ignored.

On the first pressure-framed prompt after the bypass takes effect, Claude prints a visible banner identifying the bypass and the restore command. The banner is intentional — the bypass is never silent. Exact banner wording is defined in [`rules/planning.md`](rules/planning.md) under the emergency-bypass block; if you need to match on it programmatically, read the rule file rather than copy-pasting from here.

**Restoring the floor:**

```sh
rm ~/.claude/DISABLE_PRESSURE_FLOOR      # or .claude/DISABLE_PRESSURE_FLOOR
```

**Verifying current state:**

```sh
ls ~/.claude/DISABLE_PRESSURE_FLOOR .claude/DISABLE_PRESSURE_FLOOR 2>/dev/null
```

No output means no sentinel file exists and the floor is active. One or two path lines means the bypass is on.

### What the bypass does NOT affect

- **Named-cost skips** still work exactly as before. Phrasings like *"skip DTP, I accept the risk of building on an unstated problem"* continue to honor the skip regardless of bypass state.
- **Non-pressure-framed prompts** are unaffected. The floor only fires on pressure framings; routine work routes normally.
- **Other planning stages** (systems-analysis, sketch, brainstorming) are unchanged.

### Caveat

Leaving the flag on permanently defeats the floor entirely — you lose the guardrail against Claude honoring a premature skip under pressure. Prefer fixing the underlying regression (open an issue with a reproduction) over making the bypass permanent.

## Git Guardrails Hook (opt-in)

A `PreToolUse` hook at [`hooks/block-dangerous-git.sh`](hooks/block-dangerous-git.sh) blocks destructive git operations at the harness layer — not by asking Claude nicely, but by exiting with code 2 before the command runs. Adapted from [mattpocock/skills `git-guardrails-claude-code`](https://github.com/mattpocock/skills/tree/main/git-guardrails-claude-code) with a narrower blocklist that targets actually-destructive operations and `CLAUDE.md`-forbidden flags, leaving normal `git push` / `git commit` alone.

### What gets blocked

| Pattern | Why |
|---|---|
| `git push --force` / `-f` / `--force-with-lease` to `main`/`master` | Force-pushing the trunk overwrites shared history. |
| `git commit --no-verify`, `git rebase --no-verify`, `git push --no-verify` | Skipping pre-commit / pre-push hooks bypasses safety checks. |
| `--no-gpg-sign` | Bypasses commit signing where required. |
| `git reset --hard` | Discards uncommitted work irreversibly. |
| `git clean -f` / `git clean -fd` | Deletes untracked files. |
| `git branch -D` | Force-deletes a branch (vs `-d` which only deletes if merged). |
| `git checkout .` / `git restore .` | Wipes uncommitted changes wholesale. |

Force-pushing to a feature branch is **allowed**. Routine `git push` and `git commit` are **allowed**.

### Install

The hook script is symlinked into `~/.claude/hooks/block-dangerous-git.sh` automatically by `bin/link-config.fish`. Wire it into the harness by adding this to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "~/.claude/hooks/block-dangerous-git.sh" }
        ]
      }
    ]
  }
}
```

If `hooks.PreToolUse` already exists, **merge** into the existing array rather than replacing.

### Verify

```sh
bash hooks/test-block-dangerous-git.sh   # smoke tests against the script
echo '{"tool_input":{"command":"git push --force origin main"}}' \
  | ~/.claude/hooks/block-dangerous-git.sh   # should exit 2 with BLOCKED message
```

### Disable

Create an empty sentinel file (mirrors the `DISABLE_PRESSURE_FLOOR` pattern):

```sh
touch ~/.claude/DISABLE_GIT_GUARDRAILS    # global
touch .claude/DISABLE_GIT_GUARDRAILS      # project-scoped (checked first)
```

Delete the file to restore. Existence alone disables; content ignored.

### Customizing the blocklist

Edit `hooks/block-dangerous-git.sh` and adjust `DANGEROUS_PATTERNS`. Patterns are extended-regex (`grep -E`). Re-run `bash hooks/test-block-dangerous-git.sh` after editing to confirm fixtures still pass.

## References

- [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) — official documentation
- [awesome-claude-md](https://github.com/josix/awesome-claude-md) — curated CLAUDE.md examples
- [HumanLayer: Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) — WHY/WHAT/HOW framework
- [Fat Marker Sketches](https://domhabersack.com/blog/fat-marker-sketches) — the concept behind the sketch rule

## Extending

### Add a Rule

Create a `.md` file in `rules/`. It loads in every session automatically.

```yaml
---
description: When this rule should activate
globs:                        # optional — omit to load always
  - "**/*.pattern"
---

Your rule content here.
```

Re-run the install script (or create the symlink manually) to activate.

### Add a Skill

Create a directory in `skills/` with a `SKILL.md` file:

```
skills/
  my-skill/
    SKILL.md
```

The `SKILL.md` needs frontmatter with `name` and `description`:

```yaml
---
name: my-skill
description: >
  One-line description of when this skill should activate.
  Include trigger phrases users might say.
---

# Skill Title

Your skill instructions here.
```

Re-run the install script to symlink it. Invoke with `/my-skill` in Claude Code.

#### Slash-only skills

For skills with side effects where timing matters (writes to memory graph, scaffolds files, creates formal records), add `disable-model-invocation: true` to the frontmatter. The skill remains invocable via `/skill-name` but Claude will never auto-trigger it. This prevents false-positive activations on workflow skills the user must consciously initiate.

```yaml
---
name: my-skill
description: ...
disable-model-invocation: true
---
```

Skip this on pipeline-mandatory skills (`define-the-problem`, `systems-analysis`, `fat-marker-sketch`) and on skills where auto-trigger value outweighs false-positive cost (`adr`, `sdr`, `tech-radar`).

### Add an Agent

Create a `.md` file in `agents/` with frontmatter:

```yaml
---
name: agent-name
description: What this agent reviews or does
tools: [Read, Grep, Glob, Bash]   # tools the agent can use
---

Your agent instructions here.
```

Re-run the install script to symlink it.
