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

A VP asks Claude to draft a Q3 strategy doc for the platform org. Claude works through the pipeline (problem → systems → trade-offs → sketch → verified draft). Halfway through, the VP says: *"Just frame it around 'improve velocity' — we'll sharpen the metric later."*

| Without this config | With this config |
|---|---|
| "Sure — drafting around 'improve velocity' now." | "I disagree — 'improve velocity' isn't a measurable goal; it's an aspiration. Sharpening the OKR now is cheaper than rewriting the doc next quarter. What's the new evidence?" |

Full pushback dialog:

> "I disagree — 'improve velocity' isn't a measurable goal; it's an aspiration. Without a baseline (PR cycle-time, lead-time, deploy frequency) the strategy doc becomes a slide deck nobody can hold the org to. Sharpening the OKR before I draft is cheaper than rewriting the doc next quarter, and it surfaces whether velocity is even the right axis vs review-quality or scope-control. What's the new evidence? If product has signed off on the aspirational framing, or you have a deadline I don't know about, I'll proceed; otherwise the vague OKR makes Q3 hard to measure."

Claude holds until you supply a reason to flip. Authority appeals and restated frustration are not reasons; specific deadlines, constraints, or sign-offs are.

_Claude holds a recommendation until new evidence flips it._

![Anti-sycophancy pushback demo](assets/anti-sycophancy-pushback.gif)

> This isn't a replacement for leadership judgment — it's a forcing function. Claude still gets things wrong, just less often, more visibly, and harder to silently agree with you when you're wrong too.

## See the pipeline in motion

Same VP, earlier in the thread: *"Draft a Q3 strategy doc to improve platform velocity."*

| Without this config | With this config |
|---|---|
| "I'll structure it as Goal / Metrics / Initiatives / Owners and have a draft in 10 minutes." | "Before any draft: what does 'velocity' mean here — cycle-time, lead-time, deploy frequency, scope-throughput? Each picks a different set of initiatives." |

What follows on the "with" side:

1. **[Problem Definition]** Named user (Platform org), current behavior (slow ship cadence), desired behavior (sharper metric + accountable owners), stakes (Q3 plan signs off in 2 weeks), evidence (last quarter's cycle-time data) — before approach selection.
2. **[Systems Analysis]** Surface-area scan — strategy doc touches engineering OKRs, performance-review rubric, hiring plan, exec readout. Blast radius flagged.
3. **[Solution Design]** 2-3 metric trees in a trade-off matrix — measurability, gameability, leading vs lagging, org impact. Recommendation with reasoning.
4. **[Fat Marker Sketch]** Visual shape of the strategy doc before any prose — strategy docs die quietly when the shape is wrong.
5. **[Drafting]** Per-section verify checks. Each initiative ties to a measurable target before "done."

Each stage is a HARD-GATE. Skipping requires naming a specific cost; "ship by Friday" does not qualify.

> Also works for ICs — same pipeline applied to a billing-tier change, a refactor proposal, a migration plan. The skill set transfers; the demo above is the leadership headliner.

_Anti-sycophancy is the hook. The pipeline is the moat._

## Install

Two distribution paths. Pick by audience — see the trade-off below.

### Plugin path (default — leadership audience)

Install from the Claude Code marketplace:

> **Coming soon** — bundle is publish-ready; clean-install test and first-run friction measurement pending. Live status tracked in [ADR #0018](adrs/0018-distribution-shape-hybrid-plugin-and-git-clone.md) (Validation items 4 + 5). Marketplace URL added here once published.

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
- **[docs/operations.md](docs/operations.md)** — runtime bypass flags, git guardrails hook, usage log hook (opt-in engagement tracking)
- **[docs/contributing.md](docs/contributing.md)** — add your own rules, skills, agents
- **[docs/superpowers/README.md](docs/superpowers/README.md)** — retention rubric for design specs and plans
- **[ADR #0020](adrs/0020-memory-layer-primary-and-delegations.md)** — where each kind of saved data goes: auto-memory MD for stable facts, ruflo MCP memory for session resume and vector search

## References

- [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) · [awesome-claude-md](https://github.com/josix/awesome-claude-md) · [HumanLayer: Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) · [Fat Marker Sketches](https://domhabersack.com/blog/fat-marker-sketches)
- [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills) — source for the Karpathy Coding Principles in `global/CLAUDE.md`
- [caveman plugin](https://github.com/JuliusBrussee/caveman) — optional terseness mode (~75% token reduction; opt-in via `/caveman`)
