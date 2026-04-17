# Archetype Rendering Conventions

Rendering conventions per archetype. Read this when `SKILL.md` Step 1 points you here —
especially for archetypes added after the original UI / system-integration pair
(before/after, sequence, C4, data-flow, state machine).

All archetypes share the base fidelity rules from `SKILL.md` (black on white,
outline-only shapes, Excalifont or Permanent Marker, no bullets-in-boxes). The sections
below only call out what's **specific** to each archetype.

---

## UI / User Journey

Already covered in depth by `SKILL.md` Step 1 and `assets/example-ui-sketch.html`.
Summary: N numbered screens side by side, 3–5 regions per screen, `[bracketed actions]`,
`FLOW` footer mapping screen-to-screen connections.

---

## Process / Workflow

- Numbered steps in a single column or row.
- Each step is one box with one short label — **no bullets inside**.
- Arrows between steps show order. Do not include conditional branches — happy path only.
- If a step has a side-effect worth naming, show it as a labeled arrow out to a small
  box, not as a bullet inside the step.

---

## CLI / Command

- Top box: the command invocation, in monospace-style label (still Excalifont, but
  prefix with `$ `).
- Below: a second box showing rough representative stdout. Fake data is fine.
- Optional third box: a one-line note on failure mode, if the failure shape is the
  point of the sketch.

---

## System Integration (Mermaid)

- `graph LR` orientation. Left-to-right read order matches how people narrate integrations.
- ≤6 nodes. If you need more, you probably want **C4 container** instead.
- No styling directives, no `classDef`, no subgraphs. If you're reaching for those,
  the sketch is too detailed — drop to fewer nodes.
- Arrows can have short labels (e.g., `API -->|HTTPS| Queue`). Do not label arrows
  with full RPC method names.
- Pair the Mermaid with a 2–4 line `FLOW` block narrating the happy path.

---

## Before/After Diptych

The delta is the **whole point**. If BEFORE and AFTER are two symmetric boxes of bullets
that a reader has to diff in their head, the sketch has failed.

**Layout**

- Two labeled frames, left and right (or top and bottom), titled `BEFORE` and `AFTER`.
- **AFTER dominates.** Give it heavier stroke weight, larger footprint, or more internal
  structure. The eye should land on AFTER first.
- BEFORE is context — crude, minimal, just enough to orient the reader.

**Delta markers (required)**

- **Removed nodes/paths**: strikethrough label, or a light-dashed outline, or a small
  `[removed]` label.
- **Added nodes/paths**: heavier stroke (e.g., 5–6px vs. the base 3–4px), or a small
  `[new]` label.
- **Deprecated-but-still-present paths**: dashed arrow instead of solid.
- **Moved/renamed components**: arrow from old location in BEFORE to new location in
  AFTER, dashed, with a short label (`moved`, `renamed`).

**What NOT to do**

- Do not render BEFORE and AFTER as two independent framed note-lists. That is the
  exact failure mode from issue #94 that this archetype exists to prevent.
- Do not use color to mark the delta. Stroke weight + line style carries it.

See `assets/example-before-after-sketch.html` for a reference rendering.

---

## Sequence / Swimlane

Use when the thing being evaluated is **interaction order across 2+ actors over time**.

**Layout**

- Vertical actor columns across the top (e.g., `User`, `API`, `Worker`, `DB`).
- Each actor gets a vertical lifeline (a thin vertical line) running down the canvas.
- Time flows **top to bottom**. Do not run sequence horizontally — it breaks the
  convention readers expect.
- Messages are horizontal arrows between lifelines, labeled with the call name
  (short — `POST /jobs`, not full request bodies).

**Conventions**

- Synchronous calls: solid arrow with filled arrowhead.
- Asynchronous / fire-and-forget: solid arrow with open arrowhead, or a short
  `(async)` label.
- Return values: dashed arrow back, only if the return is load-bearing for the sketch.
  Otherwise omit — return arrows clutter fast.
- Activation bars (thin vertical rectangles on the lifeline during a call) are
  optional. Skip them unless overlap is the point.

---

## C4 Container

Use when **multi-container architecture** is the shape and naming the tech/protocol on
each edge is load-bearing. If you only have 3 boxes and one arrow, use system
integration (Mermaid) instead.

**Layout**

- Boxes for each container (deployable/runnable unit — web app, API, worker, database,
  message broker, third-party service).
- Each box has:
  - A **name** (first line, larger).
  - A **`[Tech]` tag** in brackets (second line) — e.g., `[Node.js]`, `[Postgres]`,
    `[S3]`.
  - Optional one-line description (third line) — skip if the name is self-explanatory.
- External systems (third-party APIs, user browsers) use a different shape cue —
  e.g., dashed border — to distinguish from owned containers.

**Edges**

- Every arrow is labeled with both **intent** and **protocol**:
  `"Writes jobs [HTTPS/JSON]"`, `"Publishes events [AMQP]"`, `"Reads rows [SQL]"`.
- Direction of the arrow = direction of the call, not direction of data flow.

**Scope**

- Stay at the container level. Do not descend into components (C4 level 3) or code
  (C4 level 4). If you need that, the sketch has outgrown fat-marker fidelity.

---

## Data-Flow (Sources → Transforms → Sinks)

Use for ETL, eval pipelines, stream processors, any system whose shape is
input → transform → output.

**Layout**

- Left-to-right. Sources on the left, sinks on the right, transforms in the middle.
- Three visual tiers, distinguished by shape or position:
  - **Sources** (external input): circles or rounded rectangles, labeled with the
    source name (`User uploads`, `Kafka topic: events`).
  - **Transforms** (processing stages): plain rectangles, labeled with the operation
    (`Parse`, `Dedupe`, `Enrich`, `Score`).
  - **Sinks** (output): rounded rectangles at the far right (`Postgres: results`,
    `S3: audit log`).
- Arrows between tiers carry the **record shape** if it changes — e.g.,
  `raw JSON → parsed event`.

**Fidelity**

- Fan-out and fan-in are allowed (one transform feeding two sinks, two sources
  merging into one transform). They're often the point of the sketch.
- Do not draw error paths unless the failure shape is the thing being evaluated.

---

## State Machine

Use for discrete modes (permission modes, auth state, job lifecycle).

**Layout**

- Each state is a rounded rectangle with a short name (`PENDING`, `RUNNING`, `DONE`,
  `FAILED`).
- Transitions are arrows between states, labeled with the **trigger** (`start()`,
  `timeout`, `error`, `retry`).
- Mark the initial state with a small filled circle with an arrow into the first
  state. Mark terminal states with a double-bordered rectangle or a small `◎` after
  the name.

**Fidelity**

- Show every state the system can be in — even if rare. That's the value of a state
  diagram.
- Self-loops (state → itself on some trigger) are fine and often meaningful.
- Do not attach side-effects or actions to transitions with full sentences — a short
  verb label is enough. If side-effects are load-bearing, the sketch should probably
  be a **sequence** instead.

---

## Picking Between Adjacent Archetypes

Some pairs blur. Quick tiebreakers:

| If you're stuck between… | Pick the first if… | Pick the second if… |
|--------------------------|--------------------|---------------------|
| Process/workflow **vs.** State machine | Steps happen in order, one after another | System can sit in a state waiting for a trigger |
| System integration **vs.** C4 container | ≤6 nodes, one integration path | Multiple containers, tech/protocol labels load-bearing |
| System integration **vs.** Data-flow | Boxes are services that call each other | Boxes are stages that transform records |
| Sequence **vs.** Before/After | Interaction **order** is the question | Structural **delta** is the question |
| C4 container **vs.** Data-flow | You're naming deployable units | You're naming stages of a pipeline |
