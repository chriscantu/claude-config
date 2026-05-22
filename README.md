# claude-config

*Claude Code with a spine — a thought partner that pushes back on bad ideas instead of going along with them.*

**Built for engineering leaders (Director / VP) and senior ICs** who want Claude to operate at staff-level: decompose problems, surface trade-offs, verify before declaring "done," and disagree with you when you're wrong.

**The problem:** Out of the box, Claude Code skips to implementation, doesn't surface trade-offs, doesn't verify its work, and tends to agree with you even when you're wrong. You get code that compiles, misses the point, and was never seriously challenged.

**Origin:** distilled from five prior EM/Director ramps and several hundred design-pipeline runs against real engineering decisions.

## What you get

🧠 **A deliberate workflow** — every non-trivial feature flows through `define-the-problem → systems-analysis → brainstorming → fat-marker sketch → detailed design → TDD → verification` HARD-GATEs. Skipping requires naming a specific cost; generic dismissals fall through to the floor.

🪞 **Anti-sycophancy by design** — the `disagreement.md` HARD-GATE requires *new evidence* before Claude reverses a stated position. Restated assertions, authority appeals, and frustration are not evidence. Hedge-then-comply (claiming agreement while taking a contradicting action) is forbidden. Opening flattery is removed from communication style.

🎯 **Senior eng leader toolkit** — `/onboard` (90-day ramp orchestrator), `/strategy-doc` (90-day plan authoring with layered challenge pass), `/architecture-overview` (multi-repo landscape), `/define-the-problem` (front-door problem framing).

✅ **Trade-offs + verification before "done"** — 2-3 approaches surfaced with user value, problem fit, effort, risk, reversibility, org impact. Tests run, type-check runs, no "this should work."

See [docs/catalog.md](docs/catalog.md) for the full inventory.

## See it in action

A VP asks Claude to add a new billing tier. Claude works through the pipeline (problem → systems → trade-offs → sketch → verified implementation). Halfway through, the VP says: *"Just copy the enterprise tier and add a price field — 5-line change."*

| Without this config | With this config |
|---|---|
| "Sure, I'll copy the enterprise tier and add a price field." | "I disagree — the enterprise tier mixes billing with feature gating in `EntitlementService`, and copying it propagates that coupling into a third tier. What's the new evidence?" |

Full pushback dialog:

> "I disagree — the enterprise tier mixes billing with feature gating in `EntitlementService`, and copying it propagates that coupling into a third tier (which the systems analysis flagged as a future split target). What's the new evidence? If you have a deadline I don't know about, or product has signed off on the coupling, I'll proceed; otherwise the copy makes the eventual split harder."

Claude holds until you supply a reason to flip. Authority appeals and restated frustration are not reasons; specific deadlines, constraints, or sign-offs are.

_Claude holds a recommendation until new evidence flips it._

![Anti-sycophancy pushback demo](assets/anti-sycophancy-pushback.gif)

> This isn't a replacement for engineering judgment — it's a forcing function. Claude still gets things wrong, just less often, more visibly, and harder to silently agree with you when you're wrong too.

## See the pipeline in motion

Same VP, earlier in the thread: *"Add a new billing tier."*

| Without this config | With this config |
|---|---|
| "I'll add `TIER_PRO` to the enum, copy the enterprise pricing config, wire it into checkout. Diff incoming." | "Before any code: what problem is the new tier solving — packaging gap, retention play, or competitive response? That changes which surface owns it." |

What follows on the "with" side:

1. **[Problem Definition]** Named user, current behavior, desired behavior, stakes, evidence — before approach selection.
2. **[Systems Analysis]** Surface-area scan — touches `EntitlementService`, `CheckoutFlow`, `BillingAPI`, two downstream consumers. Blast radius flagged.
3. **[Solution Design]** 2-3 approaches in a trade-off matrix — user value, problem fit, effort, risk, reversibility. Recommendation with reasoning.
4. **[Fat Marker Sketch]** Visual shape of the change before any detailed design — refactors die quietly when the shape is wrong.
5. **[Implementation]** Per-step verify checks. Type-check + tests pass before "done."

Each stage is a HARD-GATE. Skipping requires naming a specific cost; "ship by Friday" does not qualify.

_Anti-sycophancy is the hook. The pipeline is the moat._

## Install

Two distribution paths. Pick by audience — see the trade-off below.

### Plugin path (default — leadership audience)

Install from the Claude Code marketplace:

> **Coming soon** — marketplace publish pending. Tracked in [#374](https://github.com/chriscantu/claude-config/issues/374); marketplace URL will be added here once published.

**What you get:** skills (`/sdr`, `/adr`, `/onboard`, `/tech-radar`, `/stakeholder-map`, and the rest of the leadership toolkit), agents, commands, hooks, and MCP servers.

**What you don't get:** pre-load enforcement of the HARD-GATE rules (planning pipeline, anti-sycophancy, verification), `validate.fish` governance, the ADR/SDR contributor tooling, and `rules-evals/`.

### Power-user path (engineer-grade — full HARD-GATE enforcement)

Requires [fish shell](https://fishshell.com/) (`brew install fish` on macOS, `apt install fish` on Debian).

```sh
git clone https://github.com/chriscantu/claude-config.git ~/repos/claude-config
cd ~/repos/claude-config
./bin/link-config.fish
```

Existing real files are backed up with `.bak`. Re-running is safe. CI uses `fish bin/link-config.fish --check` for verification.

**Optional — guided personalization.** After install, run `fish bin/first-run.fish` for an interactive walkthrough that patches `global/CLAUDE.md` with your shell/language/TDD/sycophancy preferences, registers the repo hooks in `~/.claude/settings.json` (with a timestamped backup), and verifies the install. Idempotent via a managed-block marker — re-run safely to update preferences.

**What you get:** everything in the plugin path PLUS `rules/` (HARD-GATE pre-load enforcement), `validate.fish` (structural + concept validation across rules, skills, agents, hooks, evals), `rules-evals/` (discriminating-signal eval suites), `bin/` tooling, and the ADR/SDR governance docs.

### Trade-off

The plugin path ships the runtime extension surface (skills, agents, commands, hooks, MCP) but loses pre-load enforcement of the planning pipeline (`define-the-problem` / `systems-analysis` / `fat-marker-sketch` / `goal-driven` / `verification` / `pr-validation` / `disagreement` / `execution-mode` / `think-before-coding` / `memory-discipline`). For end users in the leadership audience (Director / VP / Sr. IC consumers), the plugin path is sufficient — skills, agents, and hooks cover the daily workflow. For contributors, and for anyone who wants the full anti-sycophancy + planning-pipeline discipline pre-loaded into every session, the power-user path is required.

See [ADR #0018](adrs/0018-distribution-shape-hybrid-plugin-and-git-clone.md) for the decision rationale and [ADR #0013](adrs/0013-shared-vocab-monorepo-only.md) for the original distribution-shape deferral that #0018 supersedes.

**Customize `global/CLAUDE.md`** to match your shell, language defaults, and communication style — it's the one file you should personalize.

## Documentation

- **[docs/mental-model.md](docs/mental-model.md)** — start here: the eight load-bearing concepts (pipeline, skip contracts, pressure framing, emission contract, discriminating signals, anchor pattern, HARD-GATE cap, scope-tier routing)
- **[docs/catalog.md](docs/catalog.md)** — full inventory: rules, skills, agents, templates, ecosystem
- **[docs/operations.md](docs/operations.md)** — runtime bypass flags, git guardrails hook
- **[docs/contributing.md](docs/contributing.md)** — add your own rules, skills, agents
- **[docs/superpowers/README.md](docs/superpowers/README.md)** — retention rubric for design specs and plans

## References

- [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) · [awesome-claude-md](https://github.com/josix/awesome-claude-md) · [HumanLayer: Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) · [Fat Marker Sketches](https://domhabersack.com/blog/fat-marker-sketches)
- [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills) — source for the Karpathy Coding Principles in `global/CLAUDE.md`
- [caveman plugin](https://github.com/JuliusBrussee/caveman) — optional terseness mode (~75% token reduction; opt-in via `/caveman`)
