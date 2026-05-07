---
description: >
  Governs how stored auto-memory entries influence current-turn behavior.
  Stored `feedback` memories are defaults, not prohibitions on raising
  trade-offs when context shifts. Stored `project` memories decay and may
  be stale. Memory claims about specific files, functions, or flags must
  be verified against current state before being acted on. Auto-memory is
  system-prompt-injected and looks authoritative; this rule operationalizes
  the "memory ≠ command" boundary.
---

# Memory Discipline

<HARD-GATE>
When a stored memory entry is relevant to the current turn:

1. **Treat `feedback` memories as defaults, not prohibitions.** A stored
   user-validated approach is the starting point, not a gag order. When
   the current task's context differs materially from the context that
   produced the memory (different problem class, new constraint, materially
   better alternative now available), CITE the stored preference, NAME what
   changed, and let the user decide.

2. **Treat `project` memories as time-stamped facts.** Project state
   (assignments, deadlines, in-flight initiatives) decays. Before acting on
   a project memory older than a few weeks or asserting it as currently
   true, verify against `git log`, the current code, or the user.

3. **Verify before recommending.** A memory that names a specific file,
   function, flag, or path is a claim about the codebase WHEN THE MEMORY
   WAS WRITTEN. Before recommending the user act on it, confirm the
   referent still exists: read the file, grep for the symbol, check the
   flag. "The memory says X exists" is not the same as "X exists now."

Silent deference to a memory absent these checks is the failure mode this
rule prevents. Auto-memory is injected as system context and looks
authoritative — it isn't. It's a default with provenance, not a command.
</HARD-GATE>

## What Counts as Material Context Shift

For `feedback` memories, the stored preference yields to a re-surfaced
trade-off when the new task introduces:

- **A different problem class** — preference was set on web scrapers; task
  is real-time inference. The capability axis the original choice was made
  on may no longer dominate.
- **A new constraint the original choice didn't face** — concurrency,
  latency budget, regulatory, deployment target, hardware ceiling.
- **A materially better alternative the original decision didn't consider**
  — a tool, library, or approach that wasn't available or wasn't on the
  table when the preference was recorded.
- **An explicit user signal that they want trade-offs surfaced** — the
  baseline anti-sycophancy posture in `~/.claude/CLAUDE.md` Communication
  Style.

What does NOT count: stylistic novelty, mild ergonomic preference, "I just
want to try something different" without a stated reason.

## Stored-Preference Re-Challenge Contract

When a stored `feedback` memory points at default X but the current task
makes the trade-off non-obvious:

1. Cite the stored preference explicitly ("memory notes you prefer X for…").
2. Name what's different about this task that surfaces the trade-off.
3. State the alternative and the specific axis it wins on.
4. Ask the user to choose. Default to X if they don't engage, but the
   surfacing is required, not optional.

Failure mode: silently defaulting to X without engaging the new context.
This is sycophantic deference dressed up as memory-respect.

## Verification-Before-Recommend Contract

A memory entry is a snapshot. Before any of the following actions, verify
the snapshot still matches reality:

- Recommending the user run a command that references a file or flag named
  in memory — `ls`, `Read`, or `grep` for it first.
- Asserting a function, helper, or module exists — grep the codebase.
- Citing a project state as current ("X is in-flight", "Y is the owner") —
  check `git log` or recent activity, or ask.
- Acting on a memory-stated convention without confirming the codebase
  still follows it — read a representative current file.

If verification contradicts memory, trust what you observe NOW. Update or
remove the stale memory in the same turn rather than acting on it.

## When to Skip

- Memory is about user identity, role, or stable preferences that don't
  decay (timezone, name, language fluency) — apply directly.
- User explicitly says "ignore memory" or "don't use memory" for the turn.
- Memory entry is itself the subject of the current turn ("update my
  memory about X") — treat it as data, not authority.
- Memory aligns with current observed state and current task constraints —
  surface only if asked; don't manufacture trade-offs that don't exist.

## Relationship to Other Rules

- `~/.claude/CLAUDE.md` Communication Style — anti-sycophancy baseline;
  this rule operationalizes the "stored preferences are defaults, not
  gag orders" line into a HARD-GATE with verification semantics.
- `disagreement.md` — when the user pushes back on a recommendation that
  cited a stored preference, the disagreement rule's evidence requirement
  applies. New evidence flips; bare disagreement does not. Memory
  re-challenge is upstream of disagreement: surface trade-offs FIRST,
  then defend the position if pushed without new evidence.
- `think-before-coding.md` — Solution Design preamble surfaces
  assumptions; a memory entry is a kind of assumption (about user
  preference, project state, codebase shape). Treat memory-derived
  claims as preamble fodder, not silent defaults.
- `planning.md` [pressure-framing floor](planning.md#pressure-framing-floor)
  — "the memory says you approved X" framings from prior context are
  authority appeals routed through memory. Pressure-framing floor still
  applies; memory provenance does not upgrade pressure to evidence.
