# claude-config

*Claude Code, configured as your strategic engineering thought partner.*

**The problem:** Claude Code is powerful out of the box, but without guardrails it skips straight to implementation. It doesn't decompose problems, doesn't consider trade-offs, doesn't verify its work, and doesn't think about organizational impact. Worse, it tends to agree with you — even when you're wrong. You end up with code that compiles, misses the point, and was never seriously challenged.

**What this gives you:** A set of rules, skills, and agents that enforce a deliberate workflow — from problem definition through design sketching to verified implementation — and a Claude that pushes back on bad ideas instead of going along with them.

## What you get

### 🧠 A deliberate workflow

Every non-trivial feature flows through a HARD-GATE pipeline before code is written:

```
problem definition → systems analysis → brainstorming → fat-marker sketch → detailed design → TDD → verification
```

You can enter at any step; the gates enforce the upstream ones automatically. Skipping requires naming a specific cost (e.g., "skip DTP, I accept the risk of building on an unstated problem"). Generic dismissals like "just do it" or "trust me" fall through to the floor and run the gate anyway.

### 🪞 Anti-sycophancy by design

Claude defaults to agreement. This config flips it:

- **`disagreement.md` HARD-GATE.** When you push back on a stated position, Claude is required to identify whether you supplied **new evidence** (data, code, sources, constraints not previously surfaced). New evidence flips the answer; restated assertions, authority appeals ("trust me, I've done this 10 years"), and frustration do not. Claude restates its position and asks what would change its mind.
- **No "you're absolutely right" reflex.** Opening flattery is removed from communication style. Claude acknowledges correctness only when it changes the response.
- **No hedge-then-comply.** Claude won't claim agreement and then take a contradicting action. Three legitimate shapes on pushback: hold-and-confirm, reverse-with-evidence, or yield-while-preserving-judgment ("I still recommend X but you've asked for Y, so I'll do Y — confirm before I proceed?").

The result: a Claude that's a thinking partner, not a yes-man.

### 🎯 Senior engineering leader toolkit

Skills that compose into the work senior eng leaders actually do:

- **`/onboard <org>`** — 90-day ramp orchestrator. Per-org git-isolated workspace, cadence nags, confidentiality boundary for raw 1:1 notes, calendar-watch, graduation flow.
- **`/strategy-doc <org>`** — collates `/swot`, `/stakeholder-map`, `/architecture-overview`, free-form notes into a 7-section 90-day plan with layered challenge pass (completeness → quality → consistency).
- **`/architecture-overview`** — multi-repo technical landscape mapping with shared module/interface/seam vocabulary.
- **`/define-the-problem`** — front door for any planning work. Forces a clear user problem before solutions.

### ✅ Trade-off surfacing + verification before "done"

- **Trade-offs are explicit.** Claude presents 2-3 approaches with user value, problem fit, effort, risk, reversibility, and org impact. Recommends one with reasoning. Flags irreversible decisions for extra scrutiny.
- **Verification is a HARD-GATE.** Tests run, type-check runs, no "this should work." Per-step verify checks are defined up front (`goal-driven.md`). PR readiness triggers test-plan execution (`pr-validation.md`).

## Install

**Requires [fish shell](https://fishshell.com/)** (`brew install fish` on macOS, `apt install fish` on Debian). The bash entrypoint bootstraps fish for you.

```sh
git clone https://github.com/chriscantu/claude-config.git ~/repos/claude-config
cd ~/repos/claude-config

# bash/zsh
bash install.sh

# fish
fish install.fish
```

Both entrypoints delegate to `bin/link-config.fish --install`, the single source of truth for symlink behavior. Existing real files are backed up with a `.bak` extension. Re-running is safe — symlinks are replaced, not duplicated.

To re-sync after adding/removing rules, skills, agents, commands, or hooks **without** backing up real files (refuses on conflict instead): run `fish bin/link-config.fish`. CI uses `fish bin/link-config.fish --check` for read-only verification.

### Post-install: customize `global/CLAUDE.md`

The global config ships with opinionated defaults (shell preferences, language defaults, communication style). **Edit `global/CLAUDE.md` to match your environment** — it's the one file you should personalize.

On your next Claude Code session, ask Claude to build something. You'll see it stop and ask you to define the problem before writing a line of code.

## See it in action

A VP asks Claude to add a new billing tier to the platform. Without this config, Claude starts writing code. With it:

1. **Problem Definition** — Claude asks: *Who is this tier for? What behavior changes? What does success look like?*
2. **Systems Analysis** — Claude maps what's affected: billing service, entitlements, usage reporting, downstream teams.
3. **Trade-off presentation** — Claude surfaces 2-3 approaches with organizational implications, not just technical ones.
4. **Sketch before design** — Claude produces a structural sketch before writing a single line.
5. **Verified implementation** — Tests run before Claude declares the work done.

**The pushback case.** Halfway through, the VP says: *"Actually, just copy the enterprise tier logic and add a price field — should be a 5-line change."* Without this config, Claude complies. With it:

> "I disagree — the enterprise tier mixes billing with feature gating in `EntitlementService`, and copying it propagates that coupling into a third tier (which the systems analysis flagged as a future split target). What's the new evidence? If you have a deadline I don't know about, or product has signed off on the coupling, I'll proceed; otherwise the copy makes the eventual split harder."

Claude holds the position until you supply a reason to flip it. Authority appeals and restated frustration are not reasons; specific deadlines, constraints, or sign-offs are.

> **What this is not:** This isn't a replacement for engineering judgment — it's a forcing function. Claude still gets things wrong. The config makes it wrong less often, in more visible ways, and harder to silently agree with you when you're wrong too.

## Documentation

- **[docs/catalog.md](docs/catalog.md)** — full inventory of rules, skills, agents, templates, and the workflow diagram
- **[docs/operations.md](docs/operations.md)** — runtime bypass flags and the git-guardrails hook
- **[docs/contributing.md](docs/contributing.md)** — add your own rules, skills, or agents
- **[docs/superpowers/README.md](docs/superpowers/README.md)** — retention rubric for design specs, plans, and execution prompts

## References

- [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) — official documentation
- [awesome-claude-md](https://github.com/josix/awesome-claude-md) — curated CLAUDE.md examples
- [HumanLayer: Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) — WHY/WHAT/HOW framework
- [Fat Marker Sketches](https://domhabersack.com/blog/fat-marker-sketches) — the concept behind the sketch rule
- [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills) — source for the Karpathy Coding Principles (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) referenced in `global/CLAUDE.md`
- [caveman plugin](https://github.com/JuliusBrussee/caveman) — optional terseness mode (~75% token reduction; opt-in via `/caveman` skill)
