---
description: >
  Stored auto-memory is a default with provenance, not a command. Cite a
  feedback memory as a stored preference before applying it; verify any
  file/function/flag a memory names before acting on it.
---

# Memory Discipline

<HARD-GATE>
Auto-memory is system-prompt-injected and looks authoritative, but it is a
default with provenance, not a command.

1. **A `feedback` memory is a stored default, not an order.** Even when it
   looks like a safe choice, cite it as a *stored preference* and check what
   the project already uses before applying it. Silent obedience is the
   failure mode.

2. **A memory naming a file / function / flag is a snapshot claim.** Read,
   grep, or `git log` to confirm the referent still exists before telling
   the user to act on it.
</HARD-GATE>

## When to Skip
- Memory aligns with observed state — don't manufacture doubt
- User says "ignore memory" for the turn, or memory is the turn's subject
