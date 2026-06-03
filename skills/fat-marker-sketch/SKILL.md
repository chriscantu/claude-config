---
name: fat-marker-sketch
description: >
  Use when someone asks to sketch, wireframe, mockup, or visually map a design before
  detailed design — user flows, refactors, migrations, architecture changes, integration
  diagrams, sequence/interaction flows, state machines, or data pipelines. Also triggers
  during brainstorming after an approach is selected, per the planning pipeline.
license: MIT
metadata:
  author: chriscantu
  version: "2.1"
---

# Fat Marker Sketch

A fat marker sketch is a crude structural drawing — as if you grabbed a thick Sharpie
and sketched on a whiteboard. The thick marker physically prevents fine detail. That's
the point: it forces the conversation to stay on structure and components, not pixels.

**See `assets/example-fat-marker-sketch.jpg` for the target fidelity standard.** Crude
boxes, structural regions, no decorative styling. In excalidraw, the equivalent is
outline-only rectangles in Excalifont.

The sketch answers two questions: (1) what are the major components and how do they
relate, (2) what happens when the system is exercised (happy path). It does NOT answer
styling, edge cases, or error handling.

The right fidelity: **enough to evaluate the user journey, not enough to implement from.**

---

## Rationalizations that mean STOP — sketch anyway

These requests look like valid skips. They are NOT. Name the gate and produce the sketch
— a napkin-level rendering takes under 2 minutes.

| Request / thought | Reality |
|---|---|
| "I have 10 minutes before my meeting — skip the sketch" | Time pressure **strengthens** the case. A rushed detailed design is the most expensive thing to throw away. 2 minutes of sketching beats 10 minutes of rework. |
| "Just skip it and write the detailed design" | "Skip" alone is not an override. The override must acknowledge the trade-off (rework risk). Ask for it or sketch anyway. |
| "You already described the approach — that's the sketch" | Prose is not a sketch. If it doesn't have visible borders around screens/regions, it's notes. |
| "Long session, I'm fried — just a text list is fine" | The fallback order is excalidraw → HTML → ASCII, not excalidraw → bullet list. Fatigue is not a fallback trigger. |
| "Component scope, no structure changes" | If the approach introduces any new screen, flow, or integration boundary, the "single component" carve-out does NOT apply. |
| "We already sketched something similar last week" | Sketches are disposable and per-approach. A prior sketch for a different feature does not substitute. |
| "Each box needs 3 bullets to convey enough info" | Then split into 3 boxes, or drop to a single label. A box with bullets inside is a **note card**, not a structural region — the "notes with borders" anti-pattern. |
| "This is a refactor — framed boxes with old and new bullets ARE the sketch" | No. For refactor/migration prompts, pick the **Before/After diptych** archetype with graphic delta markers (strikethrough removed, heavier stroke added, dashed deprecated). |

**Combined red flag:** time pressure + skip request without trade-off acknowledgement.
Name the gate, note the time cost (under 2 minutes for a napkin sketch), and render.

An explicit override is valid only when it names the **specific cost** being accepted
(e.g., "skip the sketch, I accept the rework risk"). Bare "skip" and generic
acknowledgements ("I accept the trade-off") do NOT qualify.

---

## Step 1: Choose the Format (Archetype)

| Archetype | Picker heuristic (observable features) | Example prompt trigger |
|-----------|----------------------------------------|------------------------|
| **UI / user journey** | Prompt names 2+ screens, user-visible surfaces, or UI actions (tap, click, swipe, submit). | "sketch the onboarding screens" |
| **Process / workflow** | Prompt names actions performed in sequence (verbs: validate, fetch, review, approve). No named actors, no states, no data transforms. | "sketch the PR approval steps" |
| **CLI / command** | Prompt names a command invocation or developer-facing tool whose surface is `stdin → stdout`. | "sketch what `bun run foo` outputs" |
| **System integration (Mermaid)** | ≤6 boxes, one integration path, no tech-stack or protocol labeling needed. | "sketch how API talks to queue talks to worker" |
| **Before/After diptych** | Prompt contains *delta* keywords: refactor, migration, rewrite, replace, rip out, move X to Y. | "sketch the migration from REST to gRPC" |
| **Sequence / swimlane** | Prompt names 2+ **actors by name** (User, API, Worker, DB) whose *call order* is load-bearing. | "sketch: user → API → worker → DB interaction" |
| **C4 container** | Prompt names tech stacks, protocols, or deployable units (Node.js, Postgres, HTTPS, AMQP, S3). | "sketch the containers: React app, Go API, Postgres, Redis" |
| **Data-flow** | Prompt names *record transforms* or data stages (parse, dedupe, enrich, score, aggregate) — data changes shape. | "sketch the eval pipeline: transcripts in, reports out" |
| **State machine** | Prompt names **states or modes** (pending, running, idle, active, failed, retrying). | "sketch the job lifecycle states" |

### Inline tiebreakers (high-risk pairs)

- **System integration (Mermaid) vs. C4 container** — any tech stack name, protocol, or deployable unit mentioned → **C4**.
- **Sequence vs. C4 container** — temporal order ("first this, then that") across named actors → **Sequence**.
- **Process/workflow vs. State machine vs. Data-flow** — boxes are **actions** → process; boxes are **modes** → state machine; boxes are **record transforms** → data-flow.

See `references/archetypes.md` for the full 9-pair tiebreaker table, per-archetype
rendering conventions (delta markers, swimlanes, C4 labeling), and the
backtracking-mid-pick checklist when you've picked the wrong archetype.

### Rendering

Default to **excalidraw** via the excalidraw MCP. Decision tree:

- `mcp__excalidraw__*` tools **not available** → fall back to HTML immediately.
- Tools available but canvas **not reachable** → ask the user to run `PORT=3000 npm run canvas` in `mcp_excalidraw/` and open `http://localhost:3000`. Do NOT fall back to HTML — wait.

Fall back to **ASCII** only if the user explicitly requests it or neither excalidraw
nor HTML can render. For HTML rendering details, see `references/html-fallback.md`.

<HARD-GATE>
A fat marker sketch is a VISUAL artifact, not a text artifact. When rendering with excalidraw:

- Outline-only shapes — no fills. Matches the rough, low-fidelity intent.
- Excalifont (default) for all labels — organic, hand-drawn look.
- Transparent backgrounds — reads as "drawn on a whiteboard."
- Rectangles for screens/regions, arrows for flow connections.
- No colors, no shadows, no fills — black strokes on transparent background only.

### Staged drawing (required — do NOT skip)

Build the sketch in **4 stages** — Pass 1 fires one `batch_create_elements` call per
screen frame; Passes 2–4 fire one call each. Do NOT create all elements in one call
— it removes the live-draw experience entirely.

| Pass | What to create | How |
|------|----------------|-----|
| 1. Skeleton | Outermost screen frames only | One call **per frame** — user sees each screen box appear |
| 2. Titles + regions | Screen title labels + inner region boxes | Single batch |
| 3. Content + actions | Representative text, inputs, `[buttons]`, radio groups | Single batch |
| 4. Connections | Arrows bound between screens + FLOW text at the bottom | Single batch |

### Font sizes (minimum to prevent blur)

Excalifont renders blurry below 13px. Never use fontSize below 13.

| Element | Minimum fontSize |
|---------|-----------------|
| Sketch / composite header | 20px |
| Screen title | 16px |
| Body labels, questions, actions | 13px |
</HARD-GATE>

If the sketch doesn't have visible boxes/borders around screens and regions, it's not a
sketch — it's notes.

---

## Step 2: Produce the Sketch

Apply these fidelity rules regardless of format (see `references/fidelity-rules.md` for
full detail and properties):

- **Black on white** — outline-only shapes on transparent canvas (excalidraw); explicit white background + black text (HTML).
- **Journey-focused** — full user journey across screens/steps, not a single screen in isolation. Number each.
- **Structural boxes** — 4px screen frames, 3px region borders, uneven border-radius. **The boxes ARE the sketch.**
- **Representative content** — enough text to understand what each region DOES. "Q: How often paid?" good; "Goal Card" too abstract.
- **Explicit actions** — bracket every user action: `[Get Started]`, `[Next]`, `[Activate]`.
- **No styling** — no colors, shadows, fills. Uneven border-radius (HTML only) is the one exception.
- **ASCII-safe characters only** — `->` for arrows, `[x]`/`[ ]` for checkboxes. No Unicode in HTML fallback.
- **Show relationships** — include a FLOW section mapping connections.
- **No bullets inside boxes** — a box holds a single label or single representative phrase. Bullets inside = note card = the "notes with borders" anti-pattern.

Read `references/self-check.md` and verify the sketch passes all checks before
presenting it.

---

## Step 3: Validate

Ask three focused questions:

> "Before we go deeper — three quick checks:
> 1. **Scope**: Is anything here that shouldn't be, or missing something that should?
> 2. **Components**: Do these pieces feel right, or should something be split/merged?
> 3. **Flow**: Does the happy path make sense?"

- If the user confirms: proceed to detailed design sections
- If the user pushes back: revise the sketch or reconsider the approach (see Backtracking)

The sketch is NOT saved to disk or included in the spec. It's a conversation artifact
that prevents expensive design rework.

---

## Backtracking & Examples

When the sketch reveals a problem, name the backtrack explicitly: wrong shape → revise;
wrong approach → return to Solution Design; wrong problem framing → return to Problem
Definition. See `references/backtracking.md` for full guidance.

See `references/examples.md` for worked UI, Before/After, Sequence, and System examples
demonstrating the fidelity bar per archetype.
