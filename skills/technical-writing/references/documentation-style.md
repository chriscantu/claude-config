# Documentation style

Full prose rules for technical documentation. Modeled on the
[Google developer documentation style guide highlights](https://developers.google.com/style/highlights),
adapted for Claude output. `CLAUDE.md` owns tone (plain words, lead with the
point, no flattery) and format basics (Markdown, Mermaid, newcomer-first) —
this file owns the sentence-level mechanics.

## Voice and tense

- **Second person.** Address the reader as "you." Avoid "we" for instructions
  ("we recommend" is fine; "we then run the command" is not).
- **Active voice.** Name who does the action. "The server rejects the request"
  — not "the request is rejected." Passive hides the actor and reads slower.
- **Present tense.** "The function returns a token" — not "will return."
- **Imperative for steps.** "Run the migration," "Set the flag."

## Sentence and paragraph structure

- **Conditions before instructions.** State the goal or condition first, the
  action second: "To reset the cache, delete `~/.cache/app`." A reader
  scanning for their situation finds it before committing to a step.
- **One idea per sentence.** Split compound instructions into separate steps.
- **Short paragraphs.** One topic each; lead with the topic sentence.
- **Don't pre-announce unreleased features** or roadmap items in reference docs.
- **Write for translation and a global audience** — avoid idioms, culture-bound
  references, and ambiguous "it/this" with no clear antecedent.

## Formatting

- **Sentence case** for headings and titles: "Configure the webhook" — not
  "Configure The Webhook."
- **Serial (Oxford) comma:** "logs, metrics, and traces."
- **Standard American spelling and punctuation.**
- **Code font** (backticks) for code, commands, filenames, paths, flags,
  environment variables, and literal UI element labels.
- **Bold** for UI elements the user acts on when not quoting a literal label;
  keep it sparing.
- **Numbers and dates:** spell out zero through nine in prose where it reads
  naturally; use unambiguous date formats (`2026-09-08` or "September 8, 2026",
  never `9/8`).

## Lists

- **Numbered list** — an ordered sequence of steps or ranked items.
- **Bulleted list** — an unordered set where order carries no meaning.
- **Description list** — term/definition pairs (options, fields, glossary-style).
- Keep list items parallel in grammar (all start with a verb, or all noun
  phrases — don't mix).

## Links and images

- **Descriptive link text** names the destination: "see the
  [migration guide](…)" — never "click [here](…)" or "[this](…)." Screen
  readers and scanners rely on the link text alone.
- **Alt text on every image** describing what it conveys, not "screenshot."
- Prefer **vector or high-resolution** images; they survive zoom and hi-DPI.

## Reader-test pass (before "done")

Adapted from the `doc-coauthoring` philosophy and CLAUDE.md's newcomer rule.
Before declaring a doc finished, check it against a reader who lacks your
session context:

1. **What / why before the name.** The first mention of any concept says what
   it is and why it matters before its shorthand name or acronym.
2. **No unexplained assumptions.** Every prerequisite, flag, or file the reader
   needs is stated or linked, not assumed from your context.
3. **Skimmable.** Headings and the first sentence of each section carry the
   through-line; a reader skimming only those still gets the shape.
4. **Executable.** Any command or code block runs as written, in order, from a
   clean starting state.

For a long-form doc that needs structured context-gathering and iteration, run
the `doc-coauthoring` workflow and apply these rules within it.
