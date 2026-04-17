---
name: fat-marker-sketch
description: >
  Use when someone asks to sketch, wireframe, mockup, or visually map a user flow
  before detailed design. Also triggers during brainstorming after an approach is
  selected, per the planning pipeline.
license: MIT
metadata:
  author: chriscantu
  version: "2.0"
---

# Fat Marker Sketch

A fat marker sketch is a crude structural drawing — as if you grabbed a thick Sharpie
and sketched on a whiteboard. The thick marker physically prevents fine detail. That's
the point: it forces the conversation to stay on structure and components, not pixels.

**See `assets/example-fat-marker-sketch.jpg` for a visual reference of the target fidelity.**
That image IS the standard — crude boxes, structural regions, no decorative styling.
Match that *level* of fidelity: coarse and structural, not polished. In excalidraw, the
equivalent is outline-only rectangles in Excalifont; cross-hatching and uneven radii are
HTML-fallback aesthetics and do not apply to the MCP renderer.

The sketch answers two questions:
1. **What are the major components and how do they relate?** — structural regions,
   boxes, connections. For UI: screen layout. For systems: what talks to what.
2. **What happens when the system is exercised?** — the happy-path flow. For UI:
   tap this -> see that. For backends: request enters here -> passes through these
   -> result lands there.

It does NOT answer: what things look like in detail, how they're styled, what edge
cases exist, or how errors are handled.

The right fidelity level is: **enough to evaluate the user journey, not enough to
implement from.** You should be able to look at the sketch and say "the flow is wrong"
or "screen 3 shouldn't exist" — but NOT be able to build it without further design.

---

## Rationalizations that mean STOP — sketch anyway

These requests look like valid skips. They are NOT. When you see any of them, name the
gate and produce the sketch — a napkin-level rendering takes under 2 minutes.

| Request / thought | Reality |
|---|---|
| "I have 10 minutes before my meeting — skip the sketch" | Time pressure **strengthens** the case. A rushed detailed design is the most expensive thing to throw away. 2 minutes of sketching beats 10 minutes of rework. |
| "Just skip it and write the detailed design" | "Skip" alone is not an override. The override must acknowledge the trade-off (rework risk). Ask for it or sketch anyway. |
| "You already described the approach — that's the sketch" | Prose is not a sketch. If it doesn't have visible borders around screens/regions, it's notes. See the fallback hierarchy below. |
| "Long session, I'm fried — just a text list is fine" | The fallback order is excalidraw → HTML → ASCII, not excalidraw → bullet list. Fatigue is not a fallback trigger. |
| "Component scope, no structure changes" | Verify this against the approach. If the approach introduces any new screen, flow, or integration boundary, the "single component" carve-out does NOT apply. |
| "We already sketched something similar last week" | Sketches are disposable and per-approach. A prior sketch for a different feature does not substitute. |

**The combined red flag to watch for:** time pressure + skip request without trade-off
acknowledgement. This is the pattern most likely to leak the gate. When you see it,
the correct response is to name the gate, note the time cost (under 2 minutes for a
napkin sketch), and render — not to capitulate.

An explicit override is valid only when it names the **specific cost** being accepted
(e.g., "skip the sketch, I accept the rework risk," "skip it — I'll eat the wrong-shape
risk"). Bare "skip" requests and generic acknowledgements ("I accept the trade-off,"
"I know the risks") do NOT qualify — name the gate and request the specific
acknowledgement.

---

## Step 1: Choose the Format (Archetype)

Pick the archetype that fits the shape of the work. If more than one fits, pick the one
whose **picker heuristic** is load-bearing for the decision the sketch needs to unblock.

| Archetype | Picker heuristic | Prior art |
|-----------|------------------|-----------|
| **UI / user journey** | "User sees N screens in sequence" — any output/UI feature where the conversation is about what the user does across screens. | Product wireframes |
| **Process / workflow** | "N numbered steps, one happy path" — procedural flow with no significant branching. | Swim-lanes, BPMN level-0 |
| **CLI / command** | "User types a command and sees output" — developer-facing tool whose surface area is invocation + stdout. | Man-page synopsis |
| **System integration (Mermaid)** | "A talks to B talks to C" — single integration path, ≤6 nodes, no multi-container detail needed. | `graph LR; A-->B-->C` |
| **Before/After diptych** | "We're changing how X works" — refactor, migration, or architecture change where the whole point is the **delta**. | Fowler refactoring diagrams |
| **Sequence / swimlane** | "A calls B, then B calls C, then…" — interaction order across 2+ actors over time is the thing being evaluated. | UML sequence, C4 dynamic view |
| **C4 container** | "Multiple systems with tech stacks and protocols" — multi-container architecture where naming the tech/protocol on each edge is load-bearing. | Simon Brown's C4 model |
| **Data-flow (sources → transforms → sinks)** | "Data moves through stages" — ETL, eval pipelines, stream processors, any system whose shape is input → transform → output. | DFD level-1 |
| **State machine** | "System is in exactly one of these modes" — discrete states with transitions (permission modes, auth state, job lifecycle). | UML state diagram |

If you catch yourself picking "system integration" for a refactor, or picking
"UI / user journey" for something with no UI — stop and re-pick. Using the wrong
archetype is how you end up with "notes with borders" (see Step 2 anti-patterns).

See `references/archetypes.md` for rendering conventions per archetype — especially
before/after delta markers, swimlane actor columns, and C4 labeling.

### Rendering

Default to **excalidraw** via the excalidraw MCP. Use this decision tree:

- If `mcp__excalidraw__*` tools are **not available** → fall back to HTML immediately.
- If the tools are available but the canvas is **not reachable** → ask the user to run
  `PORT=3000 npm run canvas` in the `mcp_excalidraw` directory and open
  `http://localhost:3000`. Do NOT fall back to HTML in this case — wait for the user to
  start the server.

Fall back to **HTML** (using `assets/sketch-template.html`) only when the MCP tools are
absent. Fall back to **ASCII** (markdown code block with `+`, `-`, `|` box characters)
only if the user explicitly requests it or neither excalidraw nor HTML can render.

<HARD-GATE>
A fat marker sketch is a VISUAL artifact, not a text artifact. When rendering with excalidraw:

- Use outline-only shapes — no fills. This matches the rough, low-fidelity intent.
- Use Excalifont (the excalidraw default) for all labels — it is organic and hand-drawn looking.
- Set transparent backgrounds so the sketch reads as "drawn on a whiteboard."
- Keep shapes simple: rectangles for screens/regions, arrows for flow connections.
- Do NOT add colors, shadows, or fills — black strokes on transparent background only.
- The output will be a "refined rough sketch" rather than a chaotic napkin doodle — that is acceptable and expected.

### Staged drawing (required — do NOT skip)

Build the sketch in **4 stages** — Pass 1 fires one `batch_create_elements` call per
screen frame; Passes 2–4 fire one call each. Do NOT create all elements in one call
— it causes the entire sketch to pop in fully-formed, removing the live-draw experience entirely.

| Pass | What to create | How |
|------|----------------|-----|
| 1. Skeleton | Outermost screen frames only | One call **per frame** — user sees each screen box appear |
| 2. Titles + regions | Screen title labels + inner region boxes | Single batch |
| 3. Content + actions | Representative text, inputs, `[buttons]`, radio groups | Single batch |
| 4. Connections | Arrows bound between screens + FLOW text at the bottom | Single batch |

Pass 1 draws one screen at a time so the user sees the structure emerge screen by screen. Passes 2–4 land as a single batch each.

### Font sizes (minimum to prevent blur)

Excalifont renders blurry below 13px — both on the live canvas and in screenshots.
This is not a one-off; it happens every time a small font is used.

| Element | Minimum fontSize |
|---------|-----------------|
| Sketch / composite header | 20px |
| Screen title | 16px |
| Body labels, questions, actions | 13px |

**Never use fontSize below 13.** If elements don't fit at 13px, reduce the number
of elements or increase the screen box size — do NOT shrink the font to fit more in.
</HARD-GATE>

When falling back to HTML:

- Start from `assets/sketch-template.html`
- Include Google Font: `<link href="https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap" rel="stylesheet">`
- The root element MUST set `background: #fff; color: #000; font-family: 'Permanent Marker', cursive; font-size: 20px;`
- Use `border: 4px solid #000` for screen frames and `border: 3px solid #000` for regions
- Use uneven `border-radius` values (e.g., `2px 5px 4px 3px`) on every box — vary the
  values so no two boxes have the same radius
- Do NOT inherit the host page's theme

Never output the sketch as plain prose or an unstyled text list. If it doesn't have
visible boxes/borders around screens and regions, it's not a sketch — it's notes.

See `assets/example-ui-sketch.html` for a reference of the target structure (HTML fallback).

---

## Step 2: Produce the Sketch

Apply these fidelity rules regardless of format:

- **Black on white** — black strokes and text. For excalidraw: outline-only shapes on a
  transparent canvas (like marker on a whiteboard). For HTML fallback: set an explicit
  white background and black text on the root element. Do NOT rely on the host page's theme.
- **Journey-focused** — show the full user journey across screens or steps, not a
  single screen in isolation. Number each screen/step.
- **Structural boxes** — each screen is a thick-bordered (4px) rectangle. Regions
  within screens are 3px-bordered rectangles. Use uneven border-radius on every box
  so they look hand-drawn. The boxes ARE the sketch — without them you just have a
  text list.
- **Representative content** — include enough text to understand what each region DOES,
  not just what it IS. "Q: How often paid?" is good — it tells you the screen is a
  guided questionnaire. "Goal Card" is too abstract. But don't write full copy or
  real data for every field.
- **Explicit actions** — label every user action in brackets: [Get Started], [Next],
  [Activate], [+ Add Goal]. These make the flow traceable.
- **No styling** — no colors, no shadows, no fills. For excalidraw: outline-only shapes
  with Excalifont labels. For HTML fallback: uneven border-radius for a hand-drawn feel
  is the one exception. Crude progress indicators (block characters in HTML, thin
  rectangles in excalidraw) are fine for showing proportional state.
- **ASCII-safe characters only** — use `->` for arrows, `[x]` for checked, `[ ]` for
  unchecked. For HTML fallback: do NOT use Unicode arrows or checkmarks — they render
  as garbled text in minimal HTML viewers. For excalidraw: standard ASCII is still
  preferred for simplicity, but Unicode is safe.
- **Show relationships** — how components connect (tap this -> see that, service A calls
  service B). For UI, include a FLOW section mapping connections as plain text.
- **No bullets inside boxes** — a box holds a single label or a single representative
  phrase, not a bulleted list. If a box contains more than one bullet, it has become a
  note card. Split the box into multiple boxes, or drop the bullets to a single label.
  "Notes with borders" is the anti-pattern this skill exists to prevent.

### Self-check before presenting

Read `references/self-check.md` and verify the sketch passes all checks before
presenting it.

### Properties

The sketch should:

- Fit in one screen (all screens of the journey visible together)
- Take under 2 minutes to produce
- Be disposable — it's a conversation tool, not a deliverable
- Show the **full journey** across screens/steps, not a single screen in detail
- Include representative content and explicit actions
- Omit edge cases, error states, and configuration options

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

## Backtracking

When the sketch reveals a problem, name the backtrack explicitly and go to the
right level:

- **Wrong shape, right approach**: Revise the sketch. Do NOT re-run decomposition.
  "The sketch shows [problem]. Let me redraw with [adjustment]."
- **Wrong approach**: Return to the **Solution Design** stage in the planning pipeline
  with the same decomposition intact. Present remaining approaches or propose new ones
  informed by what the sketch revealed. "The sketch revealed [X] doesn't work
  because [Y]. Let's revisit the approaches."
- **Wrong problem framing**: Rare, but if the sketch surfaces a fundamental
  misunderstanding, return to the **Problem Definition** stage and re-validate.
  "This sketch made me realize the problem might actually be [Z], not [original].
  Let's go back to the core problem."

Always state what triggered the backtrack, where you're going, and why.

---

## Examples

### UI Example

See `assets/example-ui-sketch.html` for a complete rendered example of a guided
savings feature (HTML fallback path). It shows four screens
(Welcome -> Guided Q's -> Your Plan -> Dashboard) with representative content,
bracketed actions, and a FLOW section.

**Too detailed** (wrong):
A single-screen wireframe with full sample data for every field, styled progress bars,
and dollar amounts — but no journey context. You can't evaluate the user experience
from a single screen.

**Too abstract** (wrong):
`[Header] [Status badges] [Goals list] [Paycheck breakdown] [Recommendation]`
— just a parts list. You can't evaluate the flow or whether the experience makes sense.

**Right**: The example in `assets/example-ui-sketch.html` — four screens showing the
full journey. Each has 3-5 elements with enough content to understand what the screen
DOES. Actions in brackets. A FLOW section mapping connections. No styling, no full
copy, no pixel decisions — but enough to ask "is this the right experience?"

### Before/After Example

See `assets/example-before-after-sketch.html` for a rendered refactor-shaped sketch
(eval-runner scratch-cwd change). Demonstrates AFTER-dominant visual weight,
strikethrough on removed paths, heavier stroke on added nodes, and a DELTA footer that
names the change so the reader doesn't have to diff two lists. That is the fidelity
bar for the **Before/After diptych** archetype.

### System Example

```mermaid
graph LR
  API --> Queue --> Worker --> DB
  Worker --> Notifications
```

```
FLOW
Request -> API validates -> Queue buffers -> Worker processes -> DB stores
Worker -> Notification service (async, on completion)
Failure -> Queue retries 3x -> Dead letter -> Alert
```

Five nodes. One diagram. A flow section showing the happy path and one failure mode.
Enough to ask "should notifications be sync or async?" — but not enough to implement from.
