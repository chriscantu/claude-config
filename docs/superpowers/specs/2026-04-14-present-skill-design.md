# Design Spec: `/present` Skill

**Date**: 2026-04-14
**Status**: Approved

---

## Problem Statement

**User**: Chris — individual contributor using Claude Code as a primary workflow tool

**Problem**: Creating professional presentations is slow, requires design skill separate from the content work, and produces artifacts that can't be source-controlled, diffed, or reused across contexts. Iteration is expensive because format and content are coupled.

**Impact**: High friction means fewer presentations get made or made well; polished decks require context-switching into GUI tools; slides made today can't be easily adapted tomorrow or tracked in git.

**Evidence**: Personal experience — the pain of PowerPoint/Keynote is real and widely shared.

**Constraints**: Must fit the Claude Code CLI workflow (skill pattern); output must be source-controllable (Markdown); must support Mermaid diagrams and data visualizations; must export to PDF and PPTX; fish shell compatible; Bun (not Node.js).

---

## Architecture

The skill lives at `skills/present/SKILL.md` and is symlinked globally to `~/.claude/skills/present/` via the existing `install.fish` mechanism. No infrastructure changes required.

### Renderer: Slidev + Bun

Slidev was selected over Marp and Pandoc because it is the only option that natively supports all required diagram types (Mermaid + Chart.js) while producing high-quality output for a sophisticated audience. PDF and PPTX export are both native.

Bun replaces Node.js as the runtime. All Slidev commands use `bunx slidev`.

### Workflow Pipeline

```
/present [brief | draft | slides.md]
    │
    ├─ 1. Audience & mode intake
    │      Claude asks: audience type, tone, key message, constraints
    │
    ├─ 2. Narrative generation (content-first)
    │      Claude produces: title, outline, slide-by-slide content draft
    │      User reviews and iterates in conversation
    │
    ├─ 3. Slidev Markdown generation
    │      Claude writes slides.md to ~/presentations/<slug>/
    │
    ├─ 4. Live preview
    │      bunx slidev slides.md  →  localhost:3030 (hot reload)
    │      Iteration: user requests changes conversationally,
    │      Claude edits slides.md directly
    │
    └─ 5. Export
           bunx slidev export slides.md --format pdf
           bunx slidev export slides.md --format pptx
```

### Output Location

```
~/presentations/<slug>/
├── slides.md        ← source of truth (git-trackable)
├── slides.pdf       ← generated on export
└── slides.pptx      ← generated on export
```

---

## Entry Points

The skill handles three invocation patterns:

| Entry point | Input | Claude behaviour |
|---|---|---|
| **Brief** | `/present "Q3 roadmap for exec team"` | Runs intake questions, generates outline → gets approval → writes slides.md |
| **Draft content** | `/present` with pasted notes | Restructures content into slide narrative, identifies diagram opportunities, writes slides.md |
| **Existing deck** | `/present slides.md` | Reads current deck, asks what needs to change, produces revised slides.md |

---

## Slide Structure & Theming

### Default Frontmatter

```yaml
---
theme: default
colorSchema: dark
highlighter: shiki
lineNumbers: false
fonts:
  sans: 'Inter'
  mono: 'JetBrains Mono'
transition: slide-left
---
```

Dark by default. `colorSchema: light` is noted as a swap-in for client contexts requiring it (printed handouts, bright projection rooms).

### Layouts

| Layout | Used for |
|---|---|
| `cover` | Title slide — large headline, subtitle, date |
| `default` | General content — text, bullets, images |
| `two-cols` | Side-by-side comparisons |
| `center` | Key statements, quotes, call-to-action |
| `fact` | Single large stat or highlight |

### Diagram Support

| Type | Block |
|---|---|
| Flow / sequence | Mermaid `flowchart` or `sequenceDiagram` |
| Architecture | Mermaid `graph` or `C4Context` |
| Data visualization | Chart.js (`type: bar | line | pie | doughnut`) |

### Audience-Driven Content Rules

| Audience | Content rules |
|---|---|
| Executive (B) | Max 3 bullets/slide, lead with impact, data via `fact` layout |
| Technical (A) | Code blocks welcome, architecture diagrams, more density allowed |
| Client/external (D) | Clean visuals, minimal jargon, strong narrative arc |

---

## Iteration Model

All iteration is conversational. The user never needs to edit `slides.md` directly:

- "Make slide 3 punchier for an exec audience" → Claude edits that slide
- "Add a sequence diagram showing the auth flow" → Claude inserts the Mermaid block
- "Restructure slides 2–5, the narrative arc is off" → Claude rewrites that section

The Slidev dev server hot-reloads on every save, so changes appear in the browser immediately.

---

## Error Handling

**Installation check**: Skill opens by running `bunx slidev --version`. On failure, Claude instructs the user to run `bun add -g @slidev/cli`.

**Diagram errors**: Mermaid syntax errors surface in the dev server. Claude validates block structure before writing and fixes on user report.

**Export failures**: PPTX/PDF export depends on Puppeteer/Chromium. Fallback: `bunx slidev export --format pdf --with-clicks`. Last resort: browser print-to-PDF.

---

## Testing

1. **Smoke test**: Invoke `/present` with a minimal brief, confirm `slides.md` is generated with valid Slidev frontmatter and at least a cover slide.
2. **Export verification**: Run PDF and PPTX export on the generated output, confirm files are produced.
3. Skill correctness is validated by use — no unit tests for prompt-driven content.

---

## Trade-offs & Open Questions

- **PPTX is image-based**: Slidev's PPTX export embeds rendered slide images, not editable text. Acceptable for this use case (client editing not required), but worth noting if requirements change.
- **Puppeteer dependency**: Export requires Chromium. On machines without it, export will fail until Puppeteer downloads a browser binary. First-run latency expected.
- **Theme ceiling**: The `default` theme covers the clean/minimal aesthetic well. If brand-specific styling is needed in future, a custom Slidev theme would be a separate project.
