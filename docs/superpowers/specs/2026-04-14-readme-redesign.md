# README Redesign

**Date:** 2026-04-14  
**Audience:** Sr. Directors and VPs of Engineering  
**Goals:** Hook-first clarity (understand in one screen) + post-install reference quality

---

## Problem Statement

The current README leads with feature tables before establishing why the project matters. A VP or Sr. Director landing on the repo page has no reason to keep reading past the first screen. Post-install, there is no signal of what to expect on first use.

## Selected Approach

Approach C — Hook-first restructure + "See it in action" scenario. Rearrange existing content for maximum first-screen impact, add a concrete session walkthrough, and add three targeted clarifying elements. Remove sections that serve neither primary audience.

## Design

### Tagline

Replace the dry project description with:

> *Claude Code, configured as your strategic engineering thought partner.*

Positioned directly under `# claude-config`. Sets expectations for a VP audience before any further reading.

### Document Structure (new order)

1. Tagline
2. Problem paragraph (unchanged)
3. Solution paragraph (unchanged)
4. **Install** (moved up from bottom)
5. **See it in action** (new)
6. Mental model primer (new, one sentence)
7. What's Included — Rules table
8. What's Included — Skills table
9. What's Included — Agents table
10. What's Included — Templates table
11. **What this is not** (new callout)
12. The Workflow (Mermaid diagram, unchanged)
13. References (unchanged)
14. Extending (moved to bottom, de-emphasized — content unchanged, heading level unchanged)
15. ~~Structure~~ (removed)

### New: "See it in action"

A concrete 5-step session walkthrough. Example scenario: VP asks Claude to add a new billing tier.

> A VP asks Claude to add a new billing tier to the platform. Without this config, Claude starts writing code. With it:
>
> 1. **Problem Definition** — Claude asks: *Who is this tier for? What behavior changes? What does success look like?*
> 2. **Systems Analysis** — Claude maps what's affected: billing service, entitlements, usage reporting, downstream teams
> 3. **Trade-off presentation** — Claude surfaces 2-3 approaches with organizational implications, not just technical ones
> 4. **Sketch before design** — Claude produces a structural sketch before writing a single line
> 5. **Verified implementation** — Tests run before Claude declares the work done

### New: Mental model primer

One sentence before the feature tables:

> *Rules run automatically and shape how Claude approaches every session. Skills are invoked on demand for specific workflows. Agents are specialized reviewers you bring in at key moments.*

### New: "What this is not" callout

Short paragraph after the feature tables, before the Workflow section:

> *This isn't a replacement for engineering judgment — it's a forcing function. Claude still gets things wrong. The config makes it wrong less often, and in more visible ways.*

### New: Post-install note

One line appended to the Install section:

> *On your next Claude Code session, ask Claude to build something. You'll see it stop and ask you to define the problem before writing a line of code.*

### Removed

- `## Structure` section (file tree) — derivable from the repo; noise for primary audiences
- Structure section moved to bottom and de-emphasized; content preserved for contributors

---

## What We're Not Doing

- No GIF/screencast (requires external tooling, out of scope)
- No social proof / testimonials (not applicable for a personal config repo)
- No split into README + REFERENCE.md (unnecessary complexity at this size)
- No changes to the Mermaid workflow diagram (just added, keep as-is)
