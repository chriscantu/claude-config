---
name: sdr
description: >
  Use when the user says /sdr, "create an SDR", "system design record", "write
  a system overview", "design doc for a new service", "blueprint", or wants to
  document a system-level design. Routes to one of four canonical SDR templates
  (System Overview, Service/Component Creation, Data Design, Blueprint) based
  on artifact type. Do NOT use when the decision is a single architectural
  choice — use /adr instead. Do NOT use when evaluating a tool or framework
  for adoption — use /tech-radar instead. Do NOT use when documenting a
  deviation from a tenet — use /tenet-exception instead.
status: experimental
version: 0.1.1
---

# System Design Records

Single entry point for the four canonical SDR types. Locates the
authoritative template in `~/repos/system-design-records/templates/`,
copies it into the project's SDR directory, and hands off to the user.
The skill routes — it does not redefine template content. The four
`references/<type>.md` files describe the routing surface (when to pick
each type, fields, checklist) — they are NOT a fallback template body
and MUST NOT be substituted when the canonical template is missing.

**Announce at start:** "I'm using the sdr skill to scaffold a <type> System Design Record."

## When to Use

- `/sdr` (no args) — interactive: ask which of the four types fits
- `/sdr system-overview <title>` — designing a complete system or large landscape change
- `/sdr service <title>` — implementing a new service or component
- `/sdr data <title>` — schema, data model, or storage design
- `/sdr blueprint <title>` — reference architecture / reusable pattern
- `/sdr list` — list existing SDRs in the project

## When NOT to Use

- Single architectural choice with explicit trade-offs → `/adr`
- Evaluating a tool/framework for adoption (Assess/Trial/Adopt/Hold) → `/tech-radar`
- Formally deviating from an engineering tenet → `/tenet-exception`
- Cross-repo impact analysis only → `/cross-project`
- Rough exploration before any design has converged → `superpowers:brainstorming`

## Template Routing

| Type | When | Reference |
|------|------|-----------|
| System Overview | New system, major landscape change, multi-service rework | [system-overview.md](references/system-overview.md) |
| Service/Component Creation | New service, component, or library implementation | [service-component.md](references/service-component.md) |
| Data Design | Schema change, new data model, storage selection | [data-design.md](references/data-design.md) |
| Blueprint | Reference architecture, reusable pattern, golden path | [blueprint.md](references/blueprint.md) |

If the user is unsure which type fits, ask:

1. Is this a whole system or landscape? → System Overview
2. A single service or component? → Service/Component Creation
3. Primarily about data shape, schema, or storage? → Data Design
4. A reusable pattern others will copy? → Blueprint

## Procedure

1. **Resolve template source.** Check `~/repos/system-design-records/templates/`
   exists → verify: `test -d ~/repos/system-design-records/templates`
   - **HALT on missing.** Do NOT continue the procedure. Do NOT invent
     template content. Do NOT use this skill's `references/<type>.md`
     files as a fallback template body — they describe routing only.
     Required emission: ask the user where the canonical templates live
     (different path? not yet cloned?), and offer
     `git clone <repo> ~/repos/system-design-records`. Resume only after
     the user supplies a path that satisfies the `test -d` check.

2. **Locate or create the project SDR directory.** Search in this order:
   1. `sdrs/` (matches system-design-records global convention)
   2. `domains/{Domain}/{System}/sdrs/`
   3. `docs/sdrs/` or `docs/sdr/`
   4. Any directory containing files matching `NNNN-*.md`
   - If multiple matching directories exist: ask which one — do NOT
     silently pick the first match.
   - If none exist: ask global vs domain-scoped, create accordingly.
   - verify: `ls <chosen-dir>` returns the directory.

3. **Determine the next number.** Scan existing SDRs, find the highest,
   increment by 1, pad to 4 digits. Sub-numbers `0008.1` allowed for
   related decisions — ask before assuming.
   - In a shared repo, suggest the user `git pull` first to avoid
     concurrent-author number collisions; this is advisory, not enforced.
   - verify: filename `NNNN-<kebab-title>.md` does not collide locally.

4. **Resolve template filename and copy.** The four type slugs
   (`system-overview`, `service-component`, `data-design`, `blueprint`)
   map to filenames in `~/repos/system-design-records/templates/` but
   the upstream filename convention is NOT pinned by this skill —
   resolve at runtime:
   - List the directory: `ls ~/repos/system-design-records/templates/`
   - Match the requested type to an actual filename (e.g.,
     `system-overview` may map to `system-overview.md`,
     `system_overview.md`, or similar — accept any close match,
     case- and separator-insensitive).
   - If exactly one matches → copy it to `<sdr-dir>/NNNN-<kebab-title>.md`.
   - If zero or multiple match → STOP and ask the user which file maps
     to the requested type. Do NOT guess.
   - verify: copied file exists, has non-zero size, AND its path was
     listed by the `ls` above (not synthesized).

5. **Fill metadata header.** Title, date, author, responsible architect,
   contributors, lifecycle stage (POC/Pilot/Beta/GA/Sunset), status
   (`Proposed` by default). Read the per-type [reference](references/)
   for fields specific to that template.
   - verify: metadata header has no unfilled `<...>` placeholders.

6. **Open the file** and tell the user to fill the body. Suggest invoking
   the `decision-challenger` agent (devil's advocate for SDRs) once the
   draft is substantial — it stress-tests assumptions, second-order
   effects, and stakeholder coverage.

## Backtracking

- Templates path missing → step 1 (do NOT invent content)
- Wrong template type chosen → delete the file, restart at step 4 with
  the correct type. The four types are not interchangeable; coercing one
  into another's structure produces a record that fails its own checklist.
- Title turns out to be too broad mid-draft → consider whether this is
  actually multiple SDRs. Split before merging.

## References

Read on demand:

- [system-overview.md](references/system-overview.md) — when, fields, checklist
- [service-component.md](references/service-component.md) — when, fields, checklist
- [data-design.md](references/data-design.md) — when, fields, checklist
- [blueprint.md](references/blueprint.md) — when, fields, checklist

## Related

- `/adr` — single architectural choice; finer-grained than an SDR
- `/tech-radar` — tool/framework adoption with lifecycle tracking
- `/architecture` (engineering plugin) — ADR authoring with trade-off matrix
- `decision-challenger` agent — devil's advocate review for any SDR draft
