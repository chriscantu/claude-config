# /onboard Skill — Phase 3 Implementation Plan (Confidentiality Boundary Enforcement)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (per-task spec + code-quality review across the cross-skill contract surface; see Execution Mode below). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the raw → sanitized confidentiality boundary at the filesystem and skill layers. Add per-observation sanitization tags via a new `/onboard --capture` wrapper (Q1 decision: wrap, do not modify `/1on1-prep`). Add path-based refusal in `/swot` and `/present` so neither will read `<workspace>/interviews/raw/`. Add an attribution-pattern pre-render gate that scans deck markdown for stakeholder names from `<workspace>/stakeholders/map.md` (Q2 decision: word-boundary case-insensitive regex over name strings extracted from `map.md`). Refusal + attribution logic lives in ONE place — `bin/onboard-guard.ts` (TypeScript per `memory/onboard_fish_vs_ts_inflection.md`) — called from skill bodies as a guard.

**Architecture:** Phase 1 + Phase 2 helpers untouched. New TS module `bin/onboard-guard.ts` exposes two subcommands (`refuse-raw <path>` and `attribution-check <deck-md> <map-md>`), both exit nonzero on violation. `/swot` and `/present` SKILL.md prepend a guard call before reading user-supplied paths. `/onboard` SKILL.md gains `--capture <person>` (delegates the memory-graph write to `/1on1-prep`, then runs the /onboard-owned tag-and-store flow that prompts `attributable | aggregate-only | redact` per observation and writes to `interviews/raw/`) and a `sanitize` helper that emits `interviews/sanitized/`. The pre-render attribution gate fires before `/present` is invoked from the W4/W8 milestone hand-offs.

**Tech Stack:** TypeScript + `bun:test` (helper + tests; `bun run` executes `.ts` natively, no `tsx` wrapper). Fish shell for thin dispatch in `bin/onboard-guard.fish` (one-line shim that calls `bun run bin/onboard-guard.ts`) — but the canonical entry point is `bun run` directly. Skill markdown edits for `/swot`, `/present`, `/onboard`.

**Spec:** [docs/superpowers/specs/2026-04-30-onboard-design.md](../specs/2026-04-30-onboard-design.md) (committed `cd5c530`). Phase 3 line: 172. Relevant sections: § "Confidentiality Boundary", § "Failure-Mode Mitigations" row 1, § "Open Questions" Q1 + Q2.

**Phase 1 reference:** [docs/superpowers/plans/2026-04-30-onboard-phase-1.md](2026-04-30-onboard-phase-1.md) (merged PR [#214](https://github.com/chriscantu/claude-config/pull/214), squash sha `2f36f51`).

**Phase 2 reference:** [docs/superpowers/plans/2026-04-30-onboard-phase-2.md](2026-04-30-onboard-phase-2.md) (merged PR [#215](https://github.com/chriscantu/claude-config/pull/215), squash sha `2871148`) — primary shape reference; corrected fish single-string semantics + dedupe contract patterns are not load-bearing here (Phase 3 work is TypeScript), but the TDD-pair structure and self-review checklist format are reused verbatim.

**Issue:** [#12](https://github.com/chriscantu/claude-config/issues/12).

---

## Execution Mode

**[Execution mode: subagent-driven]** Plan: 9 tasks, ~200 LOC functional change, 1 new TS helper + 4 modified SKILL.md files (`/onboard`, `/1on1-prep` UNCHANGED per Q1, `/swot`, `/present`) + 2 new test files (unit + cross-skill integration). The hallmark trigger from `rules/execution-mode.md` is **"tasks have integration coupling that benefits from per-task spec review (cross-component contracts, shared state, ordered handoffs)"** — the refusal contract spans `/swot` + `/present` + `/onboard` + the shared TS helper, and a drift in any one call-site silently weakens the gate. Per-task spec review on the SKILL.md edits catches that drift; single-implementer mode would defer the catch to one final review where the contract surface is harder to hold in head.

LOC alone (~200) does not trip the conjunctive subagent trigger (≥5 tasks AND ≥2 files AND ≥300 LOC fails on LOC), but the integration-coupling OR clause fires independently. Tie-break does not apply because no single-implementer trigger fires (8+ tasks, 6+ files, integration tests are not a 50-LOC TDD increment, not Trivial-tier).

---

## Interpretation Anchors (from preamble)

- **Q1 — Sanitization tag UX:** chose B (wrap via `/onboard --capture`). `/1on1-prep` is unchanged; the wrapper delegates the memory-graph write to it, then runs an /onboard-owned tag prompt and writes the markdown to `interviews/raw/`. Honors the rescoped /onboard contract (`memory/onboard_skill_rescoped.md` — confidentiality is /onboard's job, not /1on1-prep's). Switch to A only if a future skill needs the same tag taxonomy.
- **Q2 — Attribution-pattern grammar:** word-boundary case-insensitive regex over name strings extracted from `stakeholders/map.md` via `^- (.+?)(?:\s+[—\-:]|$)`. False positives accepted as cost of safety; manual override per render. False negatives (nicknames, misspellings, pronouns) are residual risk — flagged in `What Phase 4 picks up`.
- **Refusal-lib placement:** ONE TS module (`bin/onboard-guard.ts`) called from `/swot`, `/present`, and `/onboard` SKILL.md bodies. Per `Karpathy #2 Simplicity`, do not duplicate the path-check logic per skill. The shared module is the contract; the SKILL.md edits are call-sites.

---

## File Structure

| File | Status | Responsibility | Cross-skill flag |
|---|---|---|---|
| `bin/onboard-guard.ts` | new | Two subcommands: `refuse-raw <path>` (exit 0 if path is NOT inside any `interviews/raw/`, exit 2 with explicit error if it IS); `attribution-check <deck-md> <map-md>` (exit 0 on no match, exit 3 with match report on hit). Pure functions exported for unit test. | — |
| `tests/onboard-guard.test.ts` | new | `bun:test` suite with `mkdtempSync` fixtures. Covers refuse-raw (path inside / path outside / nested raw dir / symlink-to-raw — flagged not implemented), attribution-check (zero-match clean / single-match / multi-match / case-insensitive / word-boundary respects substring non-match like "Christopher" not matching map name "Chris"). | — |
| `tests/onboard-integration.test.ts` | new | Cross-skill fixture test: scaffolds a workspace via `bin/onboard-scaffold.fish`, writes a sample raw note + a sample deck markdown that quotes a stakeholder by name, asserts `bin/onboard-guard.ts refuse-raw <raw-file>` exits nonzero AND `attribution-check <deck> <map.md>` exits nonzero with the expected line:offset report. This is the load-bearing verify for Phase 3. | — |
| `skills/onboard/SKILL.md` | modify | Add `--capture <person>` dispatch (Q1-B wrapper); add `--sanitize <workspace>` helper invocation; add pre-render attribution gate that runs `bin/onboard-guard.ts attribution-check ...` before any milestone hand-off to `/present`; update "What this skill deliberately does NOT do (yet)" to drop confidentiality + add Calendar / --graduate. | **Q1-B** — wrapper command lives here, not in `/1on1-prep` |
| `skills/onboard/capture-and-sanitize.md` | new | Reference doc — the `/onboard --capture` flow body (delegate prep to `/1on1-prep`, ask per-observation tag, write tagged markdown to `interviews/raw/`) + the `--sanitize` flow body (read tagged raw, emit `interviews/sanitized/` per consent rules). SKILL.md links to it; not restated. | **Q1-B** — sanitization contract canonical home |
| `skills/onboard/refusal-contract.md` | new | Reference doc — the canonical refusal-and-attribution contract (what paths are refused, what the guard reports, override semantics). `/swot` and `/present` SKILL.md link here from their guard call-site, not restated. | refusal contract canonical home |
| `skills/swot/SKILL.md` | modify | Prepend a guard call to the `--read <path>` and any other user-supplied path-read entry: `bun run <repo>/bin/onboard-guard.ts refuse-raw <path>` — abort with exit-code-2 message on nonzero. Link to `skills/onboard/refusal-contract.md`. | **cross-skill** — refusal call-site |
| `skills/present/SKILL.md` | modify | Prepend a guard call to Revise mode (any path the user passes that points at `slides.md`) AND the source paths in Generate/Assist mode if the user pastes from a workspace path. Same shim pattern as `/swot`. Link to `skills/onboard/refusal-contract.md`. | **cross-skill** — refusal call-site |
| `skills/1on1-prep/SKILL.md` | **NOT MODIFIED** | Per Q1-B. Confirmed by the Self-Review Checklist's spec-coverage scan — if Q1 flips to A in implementation review, the implementation PR (NOT this plan) re-scopes. | **Q1-B** — explicit non-modification is the design |

Phase 3 introduces zero modifications to Phase 1 or Phase 2 source (`bin/onboard-scaffold.fish`, `bin/onboard-status.fish`, `skills/onboard/cadence-nags.md`) and zero modifications to existing tests.

---

## Task 1 — Failing test: `bin/onboard-guard.ts refuse-raw` rejects paths under `interviews/raw/`

**Files:**
- Create: `tests/onboard-guard.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/onboard-guard.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const GUARD = join(REPO, "bin", "onboard-guard.ts");

type RunResult = { exitCode: number; stdout: string; stderr: string };

const run = (...args: string[]): RunResult => {
  const r = spawnSync("bun", ["run", GUARD, ...args], { encoding: "utf8" });
  if (r.error) throw r.error;
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
};

const fixtures: string[] = [];
const makeWorkspace = (): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-guard-test-"));
  fixtures.push(root);
  const ws = join(root, "onboard-acme");
  mkdirSync(join(ws, "interviews", "raw"), { recursive: true });
  mkdirSync(join(ws, "interviews", "sanitized"), { recursive: true });
  mkdirSync(join(ws, "decks", "slidev"), { recursive: true });
  mkdirSync(join(ws, "stakeholders"), { recursive: true });
  return ws;
};

afterEach(() => {
  while (fixtures.length > 0) {
    try { rmSync(fixtures.pop()!, { recursive: true, force: true }); } catch {}
  }
});

describe("bin/onboard-guard.ts refuse-raw", () => {
  test("exits 0 when path is outside interviews/raw", () => {
    const ws = makeWorkspace();
    const sanitized = join(ws, "interviews", "sanitized", "themes.md");
    writeFileSync(sanitized, "## Theme A\n");
    const r = run("refuse-raw", sanitized);
    expect(r.exitCode).toBe(0);
  });

  test("exits 2 when path is directly under interviews/raw", () => {
    const ws = makeWorkspace();
    const raw = join(ws, "interviews", "raw", "2026-04-15-sarah.md");
    writeFileSync(raw, "Verbatim notes\n");
    const r = run("refuse-raw", raw);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("interviews/raw");
    expect(r.stderr).toContain("refused");
  });

  test("exits 2 when path is nested deeper under interviews/raw", () => {
    const ws = makeWorkspace();
    const nested = join(ws, "interviews", "raw", "2026-Q2", "sarah.md");
    mkdirSync(join(ws, "interviews", "raw", "2026-Q2"), { recursive: true });
    writeFileSync(nested, "Notes\n");
    const r = run("refuse-raw", nested);
    expect(r.exitCode).toBe(2);
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

```fish
bun test tests/onboard-guard.test.ts
```

Expected: FAIL — `bin/onboard-guard.ts` does not exist.

- [ ] **Step 3: Commit failing test**

```fish
git add tests/onboard-guard.test.ts
git commit -m "Add failing test for onboard-guard refuse-raw (#12)"
```

---

## Task 2 — Implement `bin/onboard-guard.ts refuse-raw`

**Files:**
- Create: `bin/onboard-guard.ts`

- [ ] **Step 1: Write the helper**

```typescript
#!/usr/bin/env bun
// onboard-guard — confidentiality boundary enforcement for /onboard workspaces.
//
// Subcommands:
//   refuse-raw <path>                Exit 2 if <path> is inside any interviews/raw/ dir.
//   attribution-check <deck> <map>   Exit 3 if <deck> markdown contains stakeholder
//                                    names extracted from <map>. (Implemented in Task 4.)

import { resolve, sep } from "node:path";

const RAW_SEGMENT = `${sep}interviews${sep}raw${sep}`;

export const isInsideRaw = (path: string): boolean => {
  const abs = resolve(path);
  // Match the segment anywhere in the absolute path. Trailing sep ensures
  // we do NOT match a file literally named "raw" outside the interviews dir.
  return (abs + sep).includes(RAW_SEGMENT);
};

const refuseRaw = (path: string): number => {
  if (isInsideRaw(path)) {
    process.stderr.write(
      `refused: ${path} is inside interviews/raw/\n` +
      `Downstream skills (/swot, /present) read interviews/sanitized/ exclusively.\n` +
      `See skills/onboard/refusal-contract.md.\n`,
    );
    return 2;
  }
  return 0;
};

const main = (): number => {
  const [sub, ...args] = process.argv.slice(2);
  switch (sub) {
    case "refuse-raw":
      if (args.length !== 1) {
        process.stderr.write("usage: onboard-guard refuse-raw <path>\n");
        return 64;
      }
      return refuseRaw(args[0]);
    case "attribution-check":
      // Implemented in Task 4.
      process.stderr.write("attribution-check not yet implemented\n");
      return 70;
    default:
      process.stderr.write(`unknown subcommand: ${sub ?? "(none)"}\n`);
      return 64;
  }
};

if (import.meta.main) process.exit(main());
```

- [ ] **Step 2: Run test, confirm pass**

```fish
bun test tests/onboard-guard.test.ts
```

Expected: PASS — refuse-raw branch covered. attribution-check tests don't exist yet; nothing else to fail.

- [ ] **Step 3: Type-check**

```fish
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```fish
git add bin/onboard-guard.ts
git commit -m "onboard-guard: refuse-raw subcommand rejects interviews/raw paths (#12)"
```

---

## Task 3 — Failing test: `attribution-check` flags stakeholder names from `map.md`

**Files:**
- Modify: `tests/onboard-guard.test.ts`

- [ ] **Step 1: Append the failing tests**

```typescript
const writeMap = (ws: string, names: string[]): string => {
  const path = join(ws, "stakeholders", "map.md");
  const body =
    "# Stakeholder Map — acme\n\n## Direct reports\n\n" +
    names.map((n) => `- ${n} — Engineer\n`).join("") +
    "\n## Cross-functional partners\n\n(none yet)\n";
  writeFileSync(path, body);
  return path;
};

const writeDeck = (ws: string, body: string): string => {
  const path = join(ws, "decks", "slidev", "slides.md");
  writeFileSync(path, body);
  return path;
};

describe("bin/onboard-guard.ts attribution-check", () => {
  test("exits 0 when deck has no stakeholder name matches", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Sarah Chen", "Marcus Diaz"]);
    const deck = writeDeck(
      ws,
      "# Reflect-back\n\nMultiple engineering leaders noted platform strain.\n",
    );
    const r = run("attribution-check", deck, map);
    expect(r.exitCode).toBe(0);
  });

  test("exits 3 with file:line:phrase report on full-name match", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Sarah Chen", "Marcus Diaz"]);
    const deck = writeDeck(
      ws,
      "# Reflect-back\n\nSarah Chen said the platform was strained.\n",
    );
    const r = run("attribution-check", deck, map);
    expect(r.exitCode).toBe(3);
    expect(r.stdout + r.stderr).toContain("slides.md:3");
    expect(r.stdout + r.stderr).toContain("Sarah Chen");
  });

  test("matches case-insensitively", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Marcus Diaz"]);
    const deck = writeDeck(ws, "# Notes\n\nper marcus diaz's recommendation.\n");
    const r = run("attribution-check", deck, map);
    expect(r.exitCode).toBe(3);
  });

  test("respects word boundaries (does NOT match Christopher when map has Chris)", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Chris"]);
    const deck = writeDeck(ws, "# Notes\n\nChristopher Nolan films are long.\n");
    const r = run("attribution-check", deck, map);
    expect(r.exitCode).toBe(0);
  });

  test("reports multiple matches on multiple lines", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Sarah Chen", "Marcus Diaz"]);
    const deck = writeDeck(
      ws,
      "# Reflect-back\n\nSarah Chen flagged risk.\n\nMarcus Diaz disagreed.\n",
    );
    const r = run("attribution-check", deck, map);
    expect(r.exitCode).toBe(3);
    const all = r.stdout + r.stderr;
    expect(all).toContain("Sarah Chen");
    expect(all).toContain("Marcus Diaz");
  });

  test("extracts name from bullet leader before role separator", () => {
    // Map line: `- Priya Patel — Director of Eng` → name is "Priya Patel"
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Priya Patel"]);
    const deck = writeDeck(ws, "# Notes\n\nPriya Patel approved the plan.\n");
    const r = run("attribution-check", deck, map);
    expect(r.exitCode).toBe(3);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```fish
bun test tests/onboard-guard.test.ts
```

Expected: FAIL — attribution-check returns 70 (not implemented).

- [ ] **Step 3: Commit failing tests**

```fish
git add tests/onboard-guard.test.ts
git commit -m "Add failing tests for onboard-guard attribution-check (#12)"
```

---

## Task 4 — Implement `attribution-check` (extract names from map.md, scan deck)

**Files:**
- Modify: `bin/onboard-guard.ts`

- [ ] **Step 1: Add the name-extraction + scan logic**

Replace the `attribution-check` stub branch in `main()` with a real implementation, and add the helpers:

```typescript
import { readFileSync } from "node:fs";
import { basename } from "node:path";

// Extract names from map.md bullet leaders. A bullet line is `- <name> — <role>`
// (em-dash, hyphen, or colon as separator). Falls back to the whole bullet text
// if no separator is present.
export const extractNames = (mapMarkdown: string): string[] => {
  const names = new Set<string>();
  for (const line of mapMarkdown.split("\n")) {
    const match = line.match(/^-\s+(.+?)(?:\s+[—\-:]\s+|$)/);
    if (!match) continue;
    const candidate = match[1].trim();
    if (candidate.length === 0) continue;
    names.add(candidate);
  }
  return [...names];
};

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type AttributionMatch = {
  file: string;
  line: number;
  name: string;
  context: string;
};

export const scanDeck = (
  deckMarkdown: string,
  deckPath: string,
  names: string[],
): AttributionMatch[] => {
  if (names.length === 0) return [];
  const pattern = new RegExp(
    `\\b(${names.map(escapeRegex).join("|")})\\b`,
    "gi",
  );
  const matches: AttributionMatch[] = [];
  const lines = deckMarkdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const lineMatches = lines[i].matchAll(pattern);
    for (const m of lineMatches) {
      matches.push({
        file: basename(deckPath),
        line: i + 1,
        name: m[0],
        context: lines[i].trim(),
      });
    }
  }
  return matches;
};

const attributionCheck = (deckPath: string, mapPath: string): number => {
  const deck = readFileSync(deckPath, "utf8");
  const map = readFileSync(mapPath, "utf8");
  const names = extractNames(map);
  const matches = scanDeck(deck, deckPath, names);
  if (matches.length === 0) return 0;

  process.stderr.write(
    `⚠️  Attribution check found stakeholder names in deck markdown.\n` +
    `Source: ${deckPath}\n` +
    `Matches:\n`,
  );
  for (const m of matches) {
    process.stderr.write(`  ${m.file}:${m.line} — "${m.context}"\n`);
  }
  process.stderr.write(
    `\nReflect-back decks must use aggregate framing\n` +
    `("multiple engineering leaders noted X"), per spec § Confidentiality Boundary.\n` +
    `See skills/onboard/refusal-contract.md for override semantics.\n`,
  );
  return 3;
};
```

Update the `case "attribution-check":` branch in `main()`:

```typescript
    case "attribution-check":
      if (args.length !== 2) {
        process.stderr.write(
          "usage: onboard-guard attribution-check <deck.md> <map.md>\n",
        );
        return 64;
      }
      return attributionCheck(args[0], args[1]);
```

- [ ] **Step 2: Run, confirm pass**

```fish
bun test tests/onboard-guard.test.ts
```

Expected: all PASS — refuse-raw + attribution-check green.

- [ ] **Step 3: Type-check**

```fish
bunx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```fish
git add bin/onboard-guard.ts
git commit -m "onboard-guard: attribution-check scans deck for stakeholder names (#12)"
```

---

## Task 5 — Write `skills/onboard/refusal-contract.md` (canonical refusal + attribution doc)

**Files:**
- Create: `skills/onboard/refusal-contract.md`

This is the canonical reference — `/swot`, `/present`, and `/onboard` SKILL.md call-sites link here, none restate the contract.

- [ ] **Step 1: Write the doc**

```markdown
# Refusal & Attribution Contract — Phase 3

This document is the canonical contract enforced by `bin/onboard-guard.ts`. Skills
that read user-supplied paths or render decks call the guard before proceeding.

## Refusal — `bin/onboard-guard.ts refuse-raw <path>`

`/swot` and `/present` MUST run this before reading any user-supplied path. Exit
codes:

| Exit | Meaning | Skill action |
|---|---|---|
| 0 | Path is outside any `interviews/raw/` directory | proceed |
| 2 | Path is inside `interviews/raw/` (refused) | abort with the guard's stderr message; surface to the user; do NOT read the file |
| 64 | Misuse (wrong arg count) | bug — file an issue |

Detection rule: the absolute path of the argument contains the literal segment
`/interviews/raw/` anywhere. Symlink traversal is NOT followed (Phase 3 limitation,
see "What Phase 4 picks up").

## Attribution — `bin/onboard-guard.ts attribution-check <deck.md> <map.md>`

`/onboard` MUST run this before invoking `/present` for any milestone reflect-back
(W4 interim, W8 final). Exit codes:

| Exit | Meaning | /onboard action |
|---|---|---|
| 0 | Deck contains zero stakeholder name matches | proceed to `/present` |
| 3 | Deck contains one or more matches; report on stderr | surface the report to the user; require explicit `override` token before proceeding |
| 64 | Misuse (wrong arg count) | bug |

Override semantics: the user types literal `override` to proceed despite matches.
Anything else aborts. The override is per-render, not persistent — a re-render
re-runs the check.

## Name extraction from `map.md`

Bullet lines in any `## ...` section under `stakeholders/map.md` matching
`^- (.+?)(?:\s+[—\-:]\s+|$)` contribute the captured name. Em-dash, hyphen, and
colon are recognized role separators. Bullets with no separator contribute the
whole bullet text as the name. Names are deduplicated; the regex is built as
`\b(name1|name2|...)\b/i`.

## What this contract deliberately does NOT cover

- Symlink-to-raw traversal (Phase 4 hardening).
- Nicknames, misspellings, pronouns ("she", "they") — false-negatives accepted as
  Phase 3 residual risk; tracked for Phase 4.
- Refusal of memory-MCP reads of raw notes — `/1on1-prep` writes only to memory
  graph, and the wrapper command (`/onboard --capture`) is the only producer of
  `interviews/raw/` markdown. Memory-graph reads are NOT path-checked.
- Refusal in skills outside this repo (no marketplace/plugin call-sites today).
```

- [ ] **Step 2: Validate**

```fish
fish validate.fish
```

Expected: PASS.

- [ ] **Step 3: Commit**

```fish
git add skills/onboard/refusal-contract.md
git commit -m "onboard: add refusal & attribution contract reference doc (#12)"
```

---

## Task 6 — Write `skills/onboard/capture-and-sanitize.md` (Q1-B wrapper flow)

**Files:**
- Create: `skills/onboard/capture-and-sanitize.md`

This is the canonical body for `/onboard --capture <person>` and `/onboard --sanitize <workspace>`. SKILL.md links here.

- [ ] **Step 1: Write the doc**

```markdown
# Capture & Sanitize — Phase 3 (Q1-B Wrapper Flow)

`/1on1-prep` is unchanged. `/onboard --capture` wraps it: delegate the
memory-graph write to `/1on1-prep`, then run the /onboard-owned tag-and-store
flow that prompts per-observation `attributable | aggregate-only | redact` and
writes the tagged markdown to `<workspace>/interviews/raw/`.

## `/onboard --capture <person>` flow

1. Verify caller is inside an /onboard workspace (parent directory contains
   `RAMP.md`). If not, abort with: "—capture must run from inside an /onboard
   workspace; cd to the workspace root first."

2. Invoke `/1on1-prep <person> --phase=capture` and let it run its standard
   6-prompt form. The memory-graph write is the user's existing canonical
   record.

3. After /1on1-prep returns the tagged-observation preview (the
   `## Tagged Observations Preview` block in `skills/1on1-prep/capture-form.md`),
   present a per-observation sanitization-tag prompt:

       For each observation above, choose:
         a) attributable     — verbatim, with explicit consent to attribute
         b) aggregate-only   — themes only, will be anonymized in sanitized/
         c) redact           — stays in raw/ only; never emitted to sanitized/

       Reply with one letter per numbered observation, e.g. "1b 2c 3a 4b".

4. Validate the response: one of `a|b|c` per observation, no missing entries.
   Re-prompt on parse failure.

5. Compose the raw markdown file:

       <workspace>/interviews/raw/<YYYY-MM-DD>-<person-slug>.md

   Format:

       # 1:1 with <Person> — <YYYY-MM-DD>

       ## Observations

       1. [attributable] <verbatim text from observation 1>
       2. [aggregate-only] <verbatim text from observation 2>
       3. [redact] <verbatim text from observation 3>
       ...

6. Write the file. Do NOT git-add — `interviews/raw/` is gitignored by Phase 1
   scaffold; the file stays local. Print the path so the user can confirm.

7. Remind the user: "Run /onboard --sanitize <workspace> when ready to emit
   sanitized themes for /swot / /present consumption."

## `/onboard --sanitize <workspace>` flow

1. Verify `<workspace>/interviews/raw/` exists. If empty, exit with "no raw
   notes to sanitize."

2. For each `*.md` file in `interviews/raw/`:

   a. Parse observations matching `^\d+\.\s+\[(attributable|aggregate-only|redact)\]\s+(.+)$`.

   b. Group by tag:
      - `attributable` → emit as-is (with the verbatim text + person attribution
        in a header). Requires explicit consent already captured at tag time.
      - `aggregate-only` → emit with attribution stripped, prefixed with the
        canonical aggregate framing ("multiple engineering leaders noted ...").
        Person name MUST NOT appear in the sanitized output.
      - `redact` → SKIP. Stays in raw/ only.

3. Write the sanitized output to:

       <workspace>/interviews/sanitized/<YYYY-MM-DD>-<person-slug>.md

   Format:

       # Sanitized themes — <YYYY-MM-DD>

       ## Attributable observations

       (only if attributable tags present; each line includes person attribution)

       ## Aggregate-only themes

       - Multiple engineering leaders noted: <verbatim text>
       - Multiple engineering leaders noted: <verbatim text>

4. Run a final sanity check: scan the emitted sanitized file for the source
   person's name (split on whitespace, regex `\b<first>\b|\b<last>\b`). If any
   match in the `## Aggregate-only themes` section, abort and surface the
   source observation — user must re-tag (likely meant `redact`).

5. git-add and commit the sanitized file:

       git -C <workspace> add interviews/sanitized/<filename>
       git -C <workspace> commit -m "Sanitized themes from <YYYY-MM-DD> 1:1"

## What this flow deliberately does NOT do

- Modify `/1on1-prep` SKILL.md or capture-form.md (Q1-B decision).
- Auto-tag observations by content heuristics — tags are user-driven per spec
  ("user tags every observation"). Auto-tagging would re-introduce the leak class.
- Sanitize across multiple raw files into a single themes file (Phase 4 — would
  benefit from cross-1:1 theme clustering, currently out of scope).
```

- [ ] **Step 2: Validate**

```fish
fish validate.fish
```

Expected: PASS.

- [ ] **Step 3: Commit**

```fish
git add skills/onboard/capture-and-sanitize.md
git commit -m "onboard: add capture-and-sanitize reference doc (Q1-B wrapper) (#12)"
```

---

## Task 7 — Wire `/swot` and `/present` SKILL.md guard call-sites

**Files:**
- Modify: `skills/swot/SKILL.md`
- Modify: `skills/present/SKILL.md`

- [ ] **Step 1: Add guard call to `/swot`**

In `skills/swot/SKILL.md`, find the `## Invocation` section that documents
`--read <path-or-url>`. Insert a new section immediately after it:

```markdown
## Confidentiality Refusal

When the caller passes `--read <path>` AND the path is local (not a URL), MUST
run the refusal guard before reading the file:

```fish
bun run <repo-root>/bin/onboard-guard.ts refuse-raw <path>
```

Exit code 2 means the path is inside an /onboard workspace's `interviews/raw/`
directory. Surface the guard's stderr message to the user and abort. Do NOT
read the file. Do NOT proceed to capture.

See [`../onboard/refusal-contract.md`](../onboard/refusal-contract.md) for full
contract semantics, override policy, and exit-code table.

The guard is a no-op for URLs and paths outside any /onboard workspace —
exits 0, /swot proceeds normally.
```

- [ ] **Step 2: Add guard call to `/present`**

In `skills/present/SKILL.md`, find the `## Entry Point Detection` section
(lines 27–35 currently). Append a new section after `## Entry Point Detection`:

```markdown
## Confidentiality Refusal (when invoked from an /onboard workspace)

When the entry path is a `slides.md` path (Revise mode) OR the user pastes
content from a workspace path (Assist mode), MUST run the refusal guard
before reading the source:

```fish
bun run <repo-root>/bin/onboard-guard.ts refuse-raw <path>
```

Exit code 2 means the path is inside an /onboard workspace's `interviews/raw/`
directory — abort and surface the guard's stderr. Do NOT read the file.

See [`../onboard/refusal-contract.md`](../onboard/refusal-contract.md).

The guard is a no-op for non-workspace paths — exits 0, /present proceeds.
```

- [ ] **Step 3: Validate skill structure**

```fish
fish validate.fish
```

Expected: PASS.

- [ ] **Step 4: Commit**

```fish
git add skills/swot/SKILL.md skills/present/SKILL.md
git commit -m "swot, present: gate path reads on onboard-guard refuse-raw (#12)"
```

---

## Task 8 — Wire `/onboard` SKILL.md `--capture`, `--sanitize`, and pre-render attribution gate

**Files:**
- Modify: `skills/onboard/SKILL.md`

- [ ] **Step 1: Add `--capture` and `--sanitize` dispatch**

After the `## Status, mute, and unmute` section added in Phase 2, insert:

```markdown
## Capture and sanitize (Phase 3)

`/onboard --capture <person>` → wrap `/1on1-prep` to capture verbatim notes
into `<workspace>/interviews/raw/` with per-observation sanitization tags
(`attributable | aggregate-only | redact`). See
[capture-and-sanitize.md](capture-and-sanitize.md) for the full flow.

`/onboard --sanitize <workspace>` → emit themes from tagged raw notes into
`<workspace>/interviews/sanitized/`. See
[capture-and-sanitize.md](capture-and-sanitize.md).

Sanitization is the gateway: `/swot` and `/present` refuse to read
`interviews/raw/` per [refusal-contract.md](refusal-contract.md). All
downstream synthesis consumes `interviews/sanitized/` exclusively.
```

- [ ] **Step 2: Add the pre-render attribution gate**

After the section above, insert:

```markdown
## Pre-render attribution gate (Phase 3)

Before invoking `/present` for any milestone reflect-back (W4 interim, W8
final), MUST run the attribution check:

```fish
bun run <repo-root>/bin/onboard-guard.ts attribution-check \
  <workspace>/decks/slidev/<deck>/slides.md \
  <workspace>/stakeholders/map.md
```

Exit code 3 means the deck contains stakeholder names from `map.md`.
Surface the guard's stderr (file:line:phrase report) to the user and
require explicit `override` token before proceeding. Anything else aborts.

See [refusal-contract.md](refusal-contract.md) for override semantics.

The gate runs PER render — re-renders re-check. There is no persistent
override state.
```

- [ ] **Step 3: Update "What this skill deliberately does NOT do (yet)"**

Trim the entry that previously deferred confidentiality enforcement to Phase 3.
The section should now read:

```markdown
## What this skill deliberately does NOT do (yet)

- Calendar API integration (Phase 4)
- `--graduate` retro + archive, including unscheduling the cadence task (Phase 5)
```

- [ ] **Step 4: Validate**

```fish
fish validate.fish
```

Expected: PASS.

- [ ] **Step 5: Commit**

```fish
git add skills/onboard/SKILL.md
git commit -m "onboard: wire --capture / --sanitize / pre-render attribution gate (#12)"
```

---

## Task 9 — Cross-skill integration test (load-bearing verify for Phase 3)

**Files:**
- Create: `tests/onboard-integration.test.ts`

This is the verify that proves the contract holds end-to-end. Per the prompt:
generic unit tests on the helper alone do NOT satisfy the refusal contract.

- [ ] **Step 1: Write the integration test**

```typescript
// tests/onboard-integration.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const SCAFFOLD = join(REPO, "bin", "onboard-scaffold.fish");
const GUARD = join(REPO, "bin", "onboard-guard.ts");

const fixtures: string[] = [];

const scaffoldWorkspace = (org: string): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-int-test-"));
  fixtures.push(root);
  const target = join(root, `onboard-${org}`);
  const r = spawnSync(
    "fish",
    [SCAFFOLD, "--target", target, "--cadence", "standard", "--no-gh"],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(`scaffold failed: ${r.stderr}`);
  }
  return target;
};

const runGuard = (...args: string[]) => {
  const r = spawnSync("bun", ["run", GUARD, ...args], { encoding: "utf8" });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
};

afterEach(() => {
  while (fixtures.length > 0) {
    try { rmSync(fixtures.pop()!, { recursive: true, force: true }); } catch {}
  }
});

describe("Phase 3 cross-skill integration", () => {
  test("scaffolded workspace + raw note → guard refuses raw path", () => {
    const ws = scaffoldWorkspace("acme");
    const rawNote = join(ws, "interviews", "raw", "2026-04-15-sarah.md");
    writeFileSync(
      rawNote,
      "# 1:1 with Sarah Chen — 2026-04-15\n\n## Observations\n\n" +
      "1. [attributable] Platform rewrite is overdue.\n" +
      "2. [redact] Critical commentary about VP Eng — do not surface.\n",
    );
    const r = runGuard("refuse-raw", rawNote);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("interviews/raw");
    expect(r.stderr).toContain("refused");
  });

  test("scaffolded workspace + sanitized note → guard allows sanitized path", () => {
    const ws = scaffoldWorkspace("acme");
    const sanitized = join(ws, "interviews", "sanitized", "2026-04-15-themes.md");
    writeFileSync(
      sanitized,
      "# Sanitized themes — 2026-04-15\n\n## Aggregate-only themes\n\n" +
      "- Multiple engineering leaders noted: platform rewrite overdue.\n",
    );
    const r = runGuard("refuse-raw", sanitized);
    expect(r.exitCode).toBe(0);
  });

  test("attribution check fires on deck quoting stakeholder by name", () => {
    const ws = scaffoldWorkspace("acme");
    // Seed map.md with a stakeholder.
    const mapPath = join(ws, "stakeholders", "map.md");
    const existing = readFileSync(mapPath, "utf8");
    writeFileSync(
      mapPath,
      existing + "\n## Direct reports\n\n- Sarah Chen — Senior Engineer\n",
    );
    // Write a deck that quotes by name.
    const deckDir = join(ws, "decks", "slidev", "interim");
    mkdirSync(deckDir, { recursive: true });
    const deckPath = join(deckDir, "slides.md");
    writeFileSync(
      deckPath,
      "# Interim reflect-back\n\nSarah Chen flagged platform risk.\n",
    );
    const r = runGuard("attribution-check", deckPath, mapPath);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("Sarah Chen");
    expect(r.stderr).toContain("slides.md:3");
  });

  test("attribution check passes on aggregated deck", () => {
    const ws = scaffoldWorkspace("acme");
    const mapPath = join(ws, "stakeholders", "map.md");
    const existing = readFileSync(mapPath, "utf8");
    writeFileSync(
      mapPath,
      existing + "\n## Direct reports\n\n- Sarah Chen — Senior Engineer\n",
    );
    const deckDir = join(ws, "decks", "slidev", "interim");
    mkdirSync(deckDir, { recursive: true });
    const deckPath = join(deckDir, "slides.md");
    writeFileSync(
      deckPath,
      "# Interim reflect-back\n\nMultiple engineering leaders noted platform risk.\n",
    );
    const r = runGuard("attribution-check", deckPath, mapPath);
    expect(r.exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run, confirm pass**

```fish
bun test tests/onboard-integration.test.ts
```

Expected: all 4 PASS. The integration test exercises the contract end-to-end:
real scaffold + real guard + real fixture data.

- [ ] **Step 3: Run full test suite + typecheck + validate**

```fish
bun test tests/
bunx tsc --noEmit
fish validate.fish
```

Expected: all PASS — Phase 1 + Phase 2 tests still green, Phase 3 unit + integration tests green.

- [ ] **Step 4: Commit**

```fish
git add tests/onboard-integration.test.ts
git commit -m "onboard: add cross-skill integration test for refusal + attribution (#12)"
```

- [ ] **Step 5: Open implementation PR (manual — separate from THIS plan PR)**

```fish
echo "## Summary
Phase 3 of /onboard: confidentiality boundary enforcement.
- bin/onboard-guard.ts (refuse-raw + attribution-check)
- /onboard --capture wrapper (Q1-B; /1on1-prep unchanged)
- /onboard --sanitize helper
- /swot and /present gate path reads on onboard-guard refuse-raw
- Pre-render attribution gate in /onboard before /present invocations
- Cross-skill integration test as load-bearing verify

## Test plan
- [ ] bun test tests/onboard-guard.test.ts passes (refuse-raw + attribution-check unit)
- [ ] bun test tests/onboard-integration.test.ts passes (4 cross-skill assertions)
- [ ] bun test tests/onboard-scaffold.test.ts still passes (Phase 1 untouched)
- [ ] bun test tests/onboard-status.test.ts still passes (Phase 2 untouched)
- [ ] bunx tsc --noEmit clean
- [ ] fish validate.fish passes
- [ ] Manual: scaffold a throwaway workspace, write a tagged raw note via
      /onboard --capture, run /onboard --sanitize, verify sanitized output
      strips redact + aggregates aggregate-only
- [ ] Manual: write a deck quoting a stakeholder, invoke /present from inside
      the workspace, assert the pre-render gate fires and 'override' proceeds
- [ ] Manual: invoke /swot --read interviews/raw/<file>, assert refusal

## Out of scope (later phases)
- Symlink-to-raw traversal hardening (Phase 4)
- Calendar integration (Phase 4)
- --graduate retro + archive (Phase 5)
- Cross-1:1 theme clustering in --sanitize

🤖 Generated with [Claude Code](https://claude.com/claude-code)" > /tmp/onboard-phase3-pr.md

git push -u origin feature/onboard-phase-3
gh pr create --title \"/onboard Phase 3 — confidentiality boundary enforcement (#12)\" --body-file /tmp/onboard-phase3-pr.md
```

---

## Self-Review Checklist (run after writing the code, before opening the implementation PR)

1. **Spec coverage** — every Phase 3 line in spec section "Implementation Phases" is covered:
   - Sanitization tags in 1:1 capture ✅ (Tasks 6 + 8 — Q1-B wrapper, /1on1-prep unchanged)
   - Refusal checks in `/swot` and `/present` ✅ (Tasks 1, 2, 5, 7)
   - Attribution-pattern pre-render hook ✅ (Tasks 3, 4, 5, 8)
   - Integration tests crossing skill boundary ✅ (Task 9)
   - ~200 LOC budget — guard ~120 LOC, ref docs ~120 lines (docs not code), SKILL.md deltas ~50 lines, tests ~250 LOC (separate budget)

2. **Q1 resolution traceable** — `/1on1-prep` SKILL.md and capture-form.md show ZERO modifications in `git diff`. The wrapper command lives in `/onboard` SKILL.md + `capture-and-sanitize.md`. If a reviewer flips Q1 to A, the implementation re-scopes (does not silently drift).

3. **Q2 resolution traceable** — attribution-check uses word-boundary case-insensitive regex over names extracted from `map.md` per the documented `^- (.+?)(?:\s+[—\-:]\s+|$)` rule. Test in Task 3 explicitly asserts `Christopher` does NOT match `Chris` (word-boundary FP guard).

4. **Refusal lib placement** — exactly ONE call-site per skill (`/swot`, `/present`, `/onboard`) calls `bin/onboard-guard.ts`. Path-check logic is NOT duplicated in any skill body. Verify with `grep -n "refuse-raw" skills/*/SKILL.md` — should return 3 lines (excluding refusal-contract.md, which is the canonical doc).

5. **Placeholder scan** — no `TBD` / `TODO` in code or plan.

6. **Type consistency across the three downstream skills' refusal call-sites** — flag/exit-code names match across:
   - `bin/onboard-guard.ts` (`refuse-raw`, exit 2; `attribution-check`, exit 3)
   - `tests/onboard-guard.test.ts` (same exit codes)
   - `tests/onboard-integration.test.ts` (same exit codes)
   - `skills/onboard/refusal-contract.md` (exit table)
   - `skills/swot/SKILL.md` (exit 2 surfaced)
   - `skills/present/SKILL.md` (exit 2 surfaced)
   - `skills/onboard/SKILL.md` (exit 3 surfaced for attribution gate)

7. **Phase boundary respected** — no Calendar code (Phase 4), no `--graduate` (Phase 5), no symlink traversal hardening (deferred to Phase 4 per refusal-contract.md). `/1on1-prep` SKILL.md and capture-form.md NOT modified per Q1-B.

8. **No Phase 1 / Phase 2 regression** — `tests/onboard-scaffold.test.ts` and `tests/onboard-status.test.ts` run unchanged. `bin/onboard-scaffold.fish` and `bin/onboard-status.fish` not modified. `skills/onboard/cadence-nags.md` not modified (the autonomous cron session reads `RAMP.md` only, never `interviews/raw/` content — the Phase 2 dedupe contract already satisfied this).

9. **Memory hooks honored**:
   - `onboard_fish_vs_ts_inflection.md` — attribution regex on markdown is the canonical TS inflection. `bin/onboard-guard.ts` is TypeScript ✅
   - `onboarding_toolkit_manual_first.md` — sanitization tag is manual user input at capture time, not derived from any external signal ✅
   - `onboard_skill_rescoped.md` — confidentiality is /onboard's job; Q1-B keeps it there ✅

10. **Override semantics honored** — attribution-check produces a `file:line:phrase` report on stderr; `/onboard` SKILL.md surfaces it and requires literal `override` token; per-render, no persistent state. Verify the override prompt text is consistent across `refusal-contract.md` and `SKILL.md` pre-render-gate section.

11. **Cross-skill integration test is load-bearing** — Task 9's test exercises the full chain: real scaffold → real raw/sanitized files → real guard. A regression in any single call-site (e.g., guard always exits 0, or scaffold stops creating `interviews/raw/`) fails this test loudly. Generic unit tests alone would not catch a SKILL.md drift where the guard is removed from a call-site — the integration test catches the contract surface, not just the guard internals.

---

## What Phase 4 Picks Up

- **Calendar-watch optional integration** — daily scan flags new invitees missing from `stakeholder-map`; graceful degrade when API unavailable. ~100 LOC per spec.
- **Symlink-to-raw traversal hardening** in `bin/onboard-guard.ts refuse-raw` — current Phase 3 detection is path-string-based and does NOT follow symlinks. A user (or future Claude session) could `ln -s interviews/raw/sarah.md /tmp/notes.md` and pass `/tmp/notes.md` to `/swot`. Phase 4 should `realpath`-resolve before the segment check.
- **Attribution-check residual risks** — nicknames not in `map.md`, misspellings, possessives that quote-read cleanly, pronouns ("she said", "they flagged"). Phase 4 candidates: pull aliases from the memory-MCP person entity (which `/stakeholder-map` populates with richer context than `map.md`); add a heuristic for first-name-only matches against a common-name allowlist.
- **Sanitization theme clustering** — current `--sanitize` emits one sanitized file per raw file. Cross-1:1 theme clustering ("five engineers raised platform risk") needs an LLM pass per spec § Skill Composition (W6 `/swot` synthesizes from `interviews/sanitized/`); Phase 4 may push some clustering into `--sanitize` or leave it to `/swot`.
- **Refusal in non-repo skills** — the contract today covers only `/swot`, `/present`, `/onboard` because they live in this repo. Marketplace plugins / other downstream consumers are out of scope; if a future skill consumes `interviews/sanitized/`, it inherits no automatic refusal — the contract must be re-asserted.

Phase 4's plan ships in `docs/superpowers/plans/<date>-onboard-phase-4.md` once Phase 3 lands.
