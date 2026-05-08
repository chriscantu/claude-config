# claude-config

*Claude Code, configured as your strategic engineering thought partner.*

**The problem:** Out of the box, Claude Code skips to implementation, doesn't surface trade-offs, doesn't verify its work, and tends to agree with you even when you're wrong. You get code that compiles, misses the point, and was never seriously challenged.

**What this gives you:** Rules, skills, and agents that enforce a deliberate workflow — and a Claude that pushes back on bad ideas instead of going along with them.

## What you get

🧠 **A deliberate workflow** — every non-trivial feature flows through `define-the-problem → systems-analysis → brainstorming → fat-marker sketch → detailed design → TDD → verification` HARD-GATEs. Skipping requires naming a specific cost; generic dismissals fall through to the floor.

🪞 **Anti-sycophancy by design** — the `disagreement.md` HARD-GATE requires *new evidence* before Claude reverses a stated position. Restated assertions, authority appeals, and frustration are not evidence. Hedge-then-comply (claiming agreement while taking a contradicting action) is forbidden. Opening flattery is removed from communication style.

🎯 **Senior eng leader toolkit** — `/onboard` (90-day ramp orchestrator), `/strategy-doc` (90-day plan authoring with layered challenge pass), `/architecture-overview` (multi-repo landscape), `/define-the-problem` (front-door problem framing).

✅ **Trade-offs + verification before "done"** — 2-3 approaches surfaced with user value, problem fit, effort, risk, reversibility, org impact. Tests run, type-check runs, no "this should work."

See [docs/catalog.md](docs/catalog.md) for the full inventory.

## Install

Requires [fish shell](https://fishshell.com/) (`brew install fish` on macOS, `apt install fish` on Debian).

```sh
git clone https://github.com/chriscantu/claude-config.git ~/repos/claude-config
cd ~/repos/claude-config
bash install.sh    # or: fish install.fish
```

Both delegate to `bin/link-config.fish --install`. Existing real files are backed up with `.bak`. Re-running is safe. CI uses `fish bin/link-config.fish --check` for verification.

**Customize `global/CLAUDE.md`** to match your shell, language defaults, and communication style — it's the one file you should personalize.

## See it in action

A VP asks Claude to add a new billing tier:

1. **Problem** — *Who is this tier for? What behavior changes? What does success look like?*
2. **Systems** — billing service, entitlements, usage reporting, downstream teams.
3. **Trade-offs** — 2-3 approaches with org implications, recommended option named.
4. **Sketch** before detailed design.
5. **Verified implementation** — tests pass before "done."

**The pushback case.** Halfway through, the VP says: *"Just copy the enterprise tier and add a price field — 5-line change."* Without this config, Claude complies. With it:

> "I disagree — the enterprise tier mixes billing with feature gating in `EntitlementService`, and copying it propagates that coupling into a third tier (which the systems analysis flagged as a future split target). What's the new evidence? If you have a deadline I don't know about, or product has signed off on the coupling, I'll proceed; otherwise the copy makes the eventual split harder."

Claude holds until you supply a reason to flip. Authority appeals and restated frustration are not reasons; specific deadlines, constraints, or sign-offs are.

> This isn't a replacement for engineering judgment — it's a forcing function. Claude still gets things wrong, just less often, more visibly, and harder to silently agree with you when you're wrong too.

## Documentation

- **[docs/catalog.md](docs/catalog.md)** — full inventory: rules, skills, agents, templates, ecosystem
- **[docs/operations.md](docs/operations.md)** — runtime bypass flags, git guardrails hook
- **[docs/contributing.md](docs/contributing.md)** — add your own rules, skills, agents
- **[docs/superpowers/README.md](docs/superpowers/README.md)** — retention rubric for design specs and plans

## References

- [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) · [awesome-claude-md](https://github.com/josix/awesome-claude-md) · [HumanLayer: Writing a Good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) · [Fat Marker Sketches](https://domhabersack.com/blog/fat-marker-sketches)
- [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills) — source for the Karpathy Coding Principles in `global/CLAUDE.md`
- [caveman plugin](https://github.com/JuliusBrussee/caveman) — optional terseness mode (~75% token reduction; opt-in via `/caveman`)
