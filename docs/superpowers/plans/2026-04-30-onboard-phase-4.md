# /onboard Skill — Phase 4 Implementation Plan (Calendar-watch + Phase 3 Carry-overs)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (single-implementer; see Execution Mode below for the rationale + re-flip criteria). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the Calendar-watch nag class with a paste-only graceful-degrade path (Q3 resolution: paste-only Phase 4; live MCP scan deferred). User pastes a Calendar attendee summary into `/onboard --calendar-paste <workspace>`; the helper parses, diffs against `<workspace>/stakeholders/map.md` via the existing `extractNames()`, and writes unmatched invitees to `<workspace>/calendar-suggestions.md`. The autonomous cron worker gains a Monday-only `calendar` nag class that fires when `<workspace>/.calendar-last-paste` is missing or 7+ days stale — the cron tool surface is NOT widened (no MCP calls from the autonomous worker). Phase 3 carry-overs: symlink-to-raw traversal hardening in `bin/onboard-guard.ts refuse-raw` (bundled, ~10 LOC); attribution residual risks deferred to Phase 5 (memory-MCP entity shape investigation is prerequisite, not a Phase 4 line item); cross-1:1 theme clustering in `--sanitize` deferred to Phase 5 (synthesis belongs in `/swot` per spec § Skill Composition).

**Architecture:** New TS module `bin/onboard-calendar.ts` exposes three subcommands — `parse <stdin|path>` (emits normalized `{name, email}[]` JSON), `diff <events.json> <map.md>` (emits unmatched invitees), and `paste <workspace>` (end-to-end: read stdin → parse → diff → write `calendar-suggestions.md` + stamp `.calendar-last-paste`). `bin/onboard-guard.ts refuse-raw` gains a `realpath`-resolve before the segment check (broken symlinks refuse). `bin/onboard-status.ts` extends the category allow-list to include `calendar`. `skills/onboard/cadence-nags.md` autonomous-session protocol gains a Monday-only Step 4.5 `calendar` check that reads `.calendar-last-paste` mtime — no MCP, no HTTP, only filesystem stat (matches the existing tool-surface contract). `skills/onboard/SKILL.md` gains a `--calendar-paste` dispatch and a `## What this skill deliberately does NOT do (yet)` trim. Phase 1+2+3 source untouched except for the additive symlink-hardening patch and the calendar-category allow-list extension.

**Tech Stack:** TypeScript + `bun:test` (helper + unit + integration tests). No fish helpers added — Phase 3 inflection committed Phase 3+ to TS up-front per `memory/onboard_fish_vs_ts_inflection.md`. Skill markdown edits for `/onboard` SKILL.md and `cadence-nags.md`.

**Spec:** [docs/superpowers/specs/2026-04-30-onboard-design.md](../specs/2026-04-30-onboard-design.md) (committed `cd5c530`, untouched since). Phase 4 line: 173. Relevant sections: § "Lag Detection (Hybrid C+D)" "Calendar-watch (optional)" subsection (line 143), § "Failure-Mode Mitigations" "Stakeholder coverage gap" row, § "Open Questions" Q3 (resolved here as paste-only).

**Phase 1 reference:** [docs/superpowers/plans/2026-04-30-onboard-phase-1.md](2026-04-30-onboard-phase-1.md) (merged PR [#214](https://github.com/chriscantu/claude-config/pull/214), squash sha `2f36f51`).

**Phase 2 reference:** [docs/superpowers/plans/2026-04-30-onboard-phase-2.md](2026-04-30-onboard-phase-2.md) (merged PR [#217](https://github.com/chriscantu/claude-config/pull/217), squash sha `52fd8b1`).

**Phase 3 reference:** [docs/superpowers/plans/2026-04-30-onboard-phase-3.md](2026-04-30-onboard-phase-3.md) (merged PR [#218](https://github.com/chriscantu/claude-config/pull/218), squash sha `ba1aba6`) — primary shape reference. The TDD-pair structure, Self-Review Checklist format, fixture-driven cross-skill integration test pattern (Task 9), and Q-resolution discipline are reused verbatim. Phase 3's `bin/onboard-guard.ts` `extractNames()` is reused directly for invitee → stakeholder match (single source of truth — Karpathy #2).

**Issue:** [#12](https://github.com/chriscantu/claude-config/issues/12).

---

## Execution Precondition

**Phase 3 PR [#218](https://github.com/chriscantu/claude-config/pull/218) MUST be merged AND executed** before Task 5 begins (allow-list extension touches `bin/onboard-status.ts`, which is Phase 3's port output) and before Task 7 begins (`cadence-nags.md` Step 4.5 inserts a new check between Phase 2's velocity check and the existing Step 5 liveness stamp). Phase 3 is merged as of `ba1aba6`, so this precondition holds at plan-merge time. If an executor picks up this plan with Phase 3 unexecuted (e.g., a stale checkout), Tasks 5 and 7 will silently miss their anchors. Verify before starting:

```fish
test -f bin/onboard-status.ts; or echo "Phase 3 not merged — abort"
grep -n "Velocity check" skills/onboard/cadence-nags.md; or echo "Phase 2 not merged — abort"
```

Tasks 1–4 + Tasks 8–11 do NOT depend on Phase 3 execution and may proceed in parallel.

---

## Execution Mode

**[Execution mode: single-implementer]** Plan: **11 tasks**, ~**260 LOC** functional change, **1 new TS module** (`bin/onboard-calendar.ts`) + small additive patches to two existing TS modules (`bin/onboard-guard.ts` realpath patch ~10 LOC; `bin/onboard-status.ts` allow-list ~3 LOC) + 2 modified markdown files (`skills/onboard/SKILL.md`, `skills/onboard/cadence-nags.md`) + 1 new reference doc (`skills/onboard/calendar-paste.md`) + 2 new test files (calendar unit + cross-skill integration). Each implementation task is a TDD increment ≤50 LOC; the cross-skill coupling is concentrated in one helper (`bin/onboard-calendar.ts`) and one cron protocol section (`cadence-nags.md` Step 4.5), where unit + integration tests catch drift far more cheaply than per-task spec review.

Per `rules/execution-mode.md`:

- **Subagent-driven conjunctive triggers:** ≥5 tasks ✓ AND ≥2 files ✓ AND ≥300 LOC ✗ (~260, below threshold). Conjunctive trigger does NOT fire.
- **Subagent-driven OR clause** (integration coupling): the calendar nag class spans `bin/onboard-calendar.ts` + `bin/onboard-status.ts` + `cadence-nags.md` + SKILL.md, but the contract surface is concentrated — the calendar parser/diff lives in one helper, the cron change is one new step in one protocol file, and the SKILL.md call-site is a single dispatch. No three-skill cross-cutting like Phase 3's refusal contract. OR clause does NOT fire.
- **Single-implementer triggers (ANY of):** "each task is a TDD increment ≤50 LOC" fires (Tasks 1, 2, 3, 4, 5, 6, 8, 11 are sub-50 TDD pairs; Tasks 7, 9, 10 are markdown edits). Trigger fires.
- **Tie-break:** subagent-driven triggers do not fire; single-implementer triggers do. No tie. Single-implementer is the unambiguous pick.

The load-bearing verify (Task 11 cross-skill integration test) replaces what per-task spec review would catch — a regression in any call-site (parser drift, diff key drift, suggestions-file format drift, Monday-stale cron drift) fails the integration test loudly. Single-implementer + thorough Self-Review Checklist run at the end is the right cost/coverage trade.

**Re-flip to subagent-driven if:** the plan grows beyond 300 LOC during execution (e.g., parser tolerance widens to full ICS spec compliance), OR a second non-cron MCP call-site is added, OR a Phase 5 carry-over surfaces that needs per-task spec review.

---

## Interpretation Anchors (from preamble)

- **Q3 — Calendar API choice:** chose C (paste-only). Live MCP scan deferred to Phase 5+. Spec line 143 names paste as a sanctioned graceful-degrade path. Cron tool surface stays narrow (no MCP/HTTP from autonomous worker). Manual-first per `memory/onboarding_toolkit_manual_first.md`. Switch to B (MCP) only if user confirms paste cadence is too heavy AND has an in-role Calendar MCP. LOC budget (~100 per spec line 173) preserved.
- **Q3.1 — Invitee match key:** name-only against `extractNames(map.md)`. Reuses Phase 3 helper directly (Karpathy #2). Email-match deferred — would require map.md schema extension (additive `<email@…>` after role separator); larger surface than Phase 4 budget allows.
- **Q3.2 — Paste format:** parser tolerates freeform `Name <email>` per-line AND ICS-subset (`ATTENDEE;CN=...:mailto:...`). No full ICS compliance.
- **Q3.3 — Diff output destination:** `<workspace>/calendar-suggestions.md` (review-friendly, persistent). NAGS.md gets a single `calendar  N new invitees pending review (see calendar-suggestions.md)` line per scan, NOT a line per invitee — preserves NAGS.md dedupe contract from Phase 2.
- **Q3.4 — Staleness signal:** `<workspace>/.calendar-last-paste` ISO-date stamp. Same on-disk-stamp pattern as Phase 2's `.cadence-last-fire`.
- **Symlink hardening (carry-over):** `bin/onboard-guard.ts refuse-raw` resolves with `realpathSync` before the segment check. Broken symlinks (target missing) → REFUSE (safer default, never accidentally surface raw via a dangling pointer). Bundled in Phase 4 (~10 LOC).
- **Attribution residual risks (carry-over):** DEFERRED to Phase 5. Pulling aliases from the memory-MCP person entity requires investigating `/stakeholder-map`'s entity schema (does it carry aliases? What shape?). That investigation is a prerequisite, not a Phase 4 line item. Pronoun/possessive heuristics are too noisy for current cost.
- **Theme clustering in `--sanitize` (carry-over):** DEFERRED to Phase 5 OR `/swot`. Spec § Skill Composition puts synthesis in `/swot` at W6. Pushing clustering into `--sanitize` duplicates synthesis logic where it doesn't belong — reaffirms `/onboard`-as-orchestrator scope (`memory/onboard_skill_rescoped.md`).

### Carry-over bundle-vs-defer decisions (explicit)

| Carry-over | Decision | Rationale |
|---|---|---|
| Symlink-to-raw traversal hardening | **IN (Task 1+2)** | ~10 LOC + 1 test, clean security tightening, no design surface; `refusal-contract.md` line 47 already names Phase 4 as the home |
| Attribution residual: nicknames | **DEFER → Phase 5** | Memory-MCP entity-shape investigation is prerequisite work, not Phase 4 |
| Attribution residual: misspellings | **DEFER → Phase 5** | Same as above; Levenshtein heuristic needs the alias table to be useful |
| Attribution residual: pronouns | **DEFER → Phase 5** | Heuristic is noisy without a possessive/clause-context model; cost > value at current scale |
| Theme clustering in `--sanitize` | **PUNT → /swot** | Synthesis belongs in `/swot` per spec § Skill Composition; pushing into `--sanitize` violates orchestrator scope |

---

## File Structure

| File | Status | Responsibility | Cross-skill flag |
|---|---|---|---|
| `bin/onboard-calendar.ts` | **new** | Three subcommands. `parse <path \| ->` reads stdin (`-`) or file, emits normalized `{name, email}[]` JSON. `diff <events.json \| -> <map.md>` reads events from file OR stdin (`-`), emits unmatched invitees (uses `extractNames()` from `bin/onboard-guard.ts`, single source of truth). Stdin support enables pipe chains: `cal parse - <paste.txt \| cal diff - map.md`. `paste <workspace>` end-to-end: stdin → parse → diff → write `<workspace>/calendar-suggestions.md` (overwritten per run) + write `<workspace>/.calendar-last-paste` ISO-date stamp + append a single `calendar  N new invitees pending review …` line to `<workspace>/NAGS.md` (subject to Phase 2 dedupe contract). Pure functions exported for unit test. Shebang `#!/usr/bin/env bun`. | — |
| `tests/onboard-calendar.test.ts` | **new** | `bun:test` suite with `mkdtempSync` fixtures. Covers parser (freeform / ICS subset / mixed-format / empty input / blank lines), diff (zero match / single match / multiple match / case-insensitive name match / EMPTY map.md returns all invitees as unmatched), and `paste` end-to-end (suggestions file shape, stamp file content, NAGS.md single-line append). | — |
| `bin/onboard-guard.ts` | **modify** (~15 LOC, net) | `refuse-raw` resolves via `realpathSync` before the segment check. Broken-symlink case (target missing) → REFUSE (exit 2 with "refused: broken symlink at <path>"). Old `isInsideRaw()` string-based export is **deleted** (no callers; YAGNI). Single canonical `checkPath()` resolver returns a `RawCheck` discriminated union; `refuseRaw()` formats stderr from it. One realpath try/catch site, no duplication. Existing tests stay green (the deleted export was never imported externally — verify with `grep -rn isInsideRaw bin/ tests/ skills/` before deleting); new tests in Task 1 cover the resolved variant. | — |
| `tests/onboard-guard.test.ts` | **modify** | Three new tests: (a) symlink-to-raw refused after realpath; (b) symlink-to-sanitized allowed (target outside `interviews/raw/`); (c) broken symlink refused (safer default). Existing 16+ tests untouched. | — |
| `bin/onboard-status.ts` | **modify** (~3 LOC) | Extend `CATEGORIES` tuple to `["milestone", "velocity", "calendar"] as const`. Update the misuse error message to include `calendar`. Existing 16 tests in `tests/onboard-status.test.ts` stay green; one new test in Task 5 asserts `--mute calendar` round-trips through the section-edit logic. | — |
| `tests/onboard-status.test.ts` | **modify** | Add ONE new test: `--mute calendar <ws>` writes `- calendar` into `## Cadence Mutes` body and `--unmute calendar <ws>` reverses it. Same pattern as the existing milestone/velocity tests. | — |
| `skills/onboard/calendar-paste.md` | **new** | Reference doc — paste-format taxonomy (freeform / ICS subset / examples), parser fault-tolerance contract, diff key (display name only — Phase 4 limitation), suggestions-file format, staleness contract, override semantics ("none — paste is purely user-initiated"). SKILL.md links here from `--calendar-paste` dispatch; not restated. | calendar-paste contract canonical home |
| `skills/onboard/SKILL.md` | **modify** | Add `## Calendar paste (Phase 4)` section after `## Pre-render attribution gate (Phase 3)`. Body documents `/onboard --calendar-paste <workspace>` invocation and links to `calendar-paste.md`. Update `## What this skill deliberately does NOT do (yet)` — drop the Calendar entry, keep `--graduate` (Phase 5). Update line 73 mute-syntax reference: `Categories: milestone | velocity | calendar` (drop "(`calendar` is Phase 4.)" parenthetical). | — |
| `skills/onboard/cadence-nags.md` | **modify** | Insert a new Step 4.5 between existing Step 4 (Velocity check) and Step 5 (liveness stamp): **Calendar-stale check** (skip if `calendar` is muted; Mondays only — abort if `today.getDay() !== 1`; read `<workspace>/.calendar-last-paste` mtime; if missing OR `today - mtime >= 7d`, append `<ISO date>  calendar  paste new invitee summary (last paste N+ days ago)` to NAGS.md, subject to existing dedupe contract). Update § "What this doc deliberately does NOT cover" to drop the Calendar-watch-as-Phase-4 entry. | calendar nag autonomous-session canonical home |
| `skills/onboard/refusal-contract.md` | **modify** | Update § "What this contract deliberately does NOT cover": REMOVE the "Symlink-to-raw traversal (Phase 4 hardening)" bullet (now covered). Keep the residual-risks bullet (defer to Phase 5). Update § "Refusal" detection-rule paragraph to note `realpath`-resolution. | — |
| `tests/onboard-integration.test.ts` | **modify** | Add ONE new describe block: "Phase 4 calendar paste". Scaffold a workspace, write a `map.md` with two stakeholders, pipe a freeform paste with one matched + one unmatched invitee through `bin/onboard-calendar.ts paste <ws>`, assert (a) `<ws>/calendar-suggestions.md` contains the unmatched name, (b) `<ws>/.calendar-last-paste` exists with today's ISO date, (c) `<ws>/NAGS.md` contains a single `calendar  1 new invitee pending review` line. Existing Phase 3 tests untouched. | **cross-skill** — load-bearing Phase 4 verify |

Phase 4 introduces zero modifications to Phase 1 source (`bin/onboard-scaffold.fish`, manager-handoff.md, ramp-template.md) and zero modifications to Phase 3 capture/sanitize source (`skills/onboard/capture-and-sanitize.md`). The `extractNames()` export from `bin/onboard-guard.ts` is reused (re-exported via `bin/onboard-calendar.ts` import) — single source of truth for stakeholder-name parsing, no duplication.

---

## Task 1 — Failing test: symlink-to-raw refused (Phase 3 carry-over)

**Files:**
- Modify: `tests/onboard-guard.test.ts`

- [ ] **Step 1: Append three failing tests**

```typescript
import { symlinkSync } from "node:fs";

describe("bin/onboard-guard.ts refuse-raw — symlink hardening (Phase 4)", () => {
  test("exits 2 when path is a symlink whose target is inside interviews/raw", () => {
    const ws = makeWorkspace();
    const real = join(ws, "interviews", "raw", "2026-04-15-sarah.md");
    writeFileSync(real, "Verbatim notes\n");
    const link = join(ws, "shortcut-to-sarah.md");
    symlinkSync(real, link);
    const r = run("refuse-raw", link);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("interviews/raw");
  });

  test("exits 0 when symlink target is outside interviews/raw", () => {
    const ws = makeWorkspace();
    const real = join(ws, "interviews", "sanitized", "themes.md");
    writeFileSync(real, "## Theme A\n");
    const link = join(ws, "shortcut-to-themes.md");
    symlinkSync(real, link);
    const r = run("refuse-raw", link);
    expect(r.exitCode).toBe(0);
  });

  test("exits 2 when symlink is broken (target missing — safer default)", () => {
    const ws = makeWorkspace();
    const link = join(ws, "dangling.md");
    symlinkSync(join(ws, "interviews", "raw", "missing.md"), link);
    const r = run("refuse-raw", link);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("broken symlink");
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```fish
bun test tests/onboard-guard.test.ts
```

Expected: 3 new tests FAIL (symlink target not resolved; current implementation segment-checks the input path string only).

- [ ] **Step 3: Commit failing tests**

```fish
git add tests/onboard-guard.test.ts
git commit -m "Add failing tests for onboard-guard symlink hardening (#12)"
```

---

## Task 2 — Implement symlink hardening in `bin/onboard-guard.ts`

**Files:**
- Modify: `bin/onboard-guard.ts`

- [ ] **Step 0: Pre-flight grep — confirm `isInsideRaw` has zero external callers**

```fish
grep -rn "isInsideRaw" bin/ tests/ skills/ docs/
```

Expected: matches in `bin/onboard-guard.ts` only (the definition + internal use). If any test or skill imports it, STOP — converting those callers is out of Phase 4 scope and the plan must amend before proceeding.

- [ ] **Step 1: Replace string-based `isInsideRaw` with a single realpath-resolving resolver**

The string-based `isInsideRaw()` export is removed (no internal callers; YAGNI per Karpathy #2). One canonical resolver returns a small struct; `refuseRaw()` formats stderr from it.

```typescript
import { realpathSync } from "node:fs";

type RawCheck =
  | { kind: "broken"; input: string }
  | { kind: "inside"; input: string; resolved: string }
  | { kind: "outside"; input: string; resolved: string };

export const checkPath = (path: string): RawCheck => {
  let resolved: string;
  try {
    resolved = realpathSync(path);
  } catch {
    return { kind: "broken", input: path };
  }
  const insideRaw = (resolved + sep).includes(RAW_SEGMENT);
  return insideRaw
    ? { kind: "inside", input: path, resolved }
    : { kind: "outside", input: path, resolved };
};

const refuseRaw = (path: string): number => {
  const check = checkPath(path);
  switch (check.kind) {
    case "broken":
      process.stderr.write(
        `refused: broken symlink at ${check.input} (target missing; refusing as safer default)\n` +
        `See skills/onboard/refusal-contract.md.\n`,
      );
      return 2;
    case "inside":
      process.stderr.write(
        `refused: ${check.input} (resolves to ${check.resolved}) is inside interviews/raw/\n` +
        `Downstream skills (/swot, /present) read interviews/sanitized/ exclusively.\n` +
        `See skills/onboard/refusal-contract.md.\n`,
      );
      return 2;
    case "outside":
      return 0;
  }
};
```

Old `isInsideRaw()` export is **deleted**. Single canonical resolver; no speculative API surface (Karpathy #2). The `RawCheck` discriminated union is the contract; `checkPath` is the single realpath try/catch site (no DRY violation).

- [ ] **Step 2: Run unit tests, confirm pass**

```fish
bun test tests/onboard-guard.test.ts
```

Expected: all (Phase 3 + 3 new Phase 4) tests PASS.

- [ ] **Step 3: Type-check + skill validate**

```fish
bunx tsc --noEmit
fish validate.fish
```

Expected: clean.

- [ ] **Step 4: Commit**

```fish
git add bin/onboard-guard.ts
git commit -m "onboard-guard: realpath-resolve refuse-raw before segment check (#12)"
```

---

## Task 3 — Failing test: calendar parser (freeform + ICS subset)

**Files:**
- Create: `tests/onboard-calendar.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/onboard-calendar.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const CAL = join(REPO, "bin", "onboard-calendar.ts");

const fixtures: string[] = [];

const runCal = (input: string, ...args: string[]) => {
  const r = spawnSync("bun", ["run", CAL, ...args], { input, encoding: "utf8" });
  return { exitCode: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
};

afterEach(() => {
  while (fixtures.length > 0) {
    try { rmSync(fixtures.pop()!, { recursive: true, force: true }); } catch {}
  }
});

describe("bin/onboard-calendar.ts parse", () => {
  test("parses freeform 'Name <email>' lines", () => {
    const input = "Sarah Chen <sarah@acme.com>\nMarcus Diaz <marcus@acme.com>\n";
    const r = runCal(input, "parse", "-");
    expect(r.exitCode).toBe(0);
    const events = JSON.parse(r.stdout);
    expect(events).toEqual([
      { name: "Sarah Chen", email: "sarah@acme.com" },
      { name: "Marcus Diaz", email: "marcus@acme.com" },
    ]);
  });

  test("parses freeform 'Name — email' (em-dash separator)", () => {
    const r = runCal("Priya Patel — priya@acme.com\n", "parse", "-");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      { name: "Priya Patel", email: "priya@acme.com" },
    ]);
  });

  test("parses bare-name lines (email absent)", () => {
    const r = runCal("Sarah Chen\n", "parse", "-");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([{ name: "Sarah Chen", email: null }]);
  });

  test("parses ICS subset ATTENDEE;CN=...:mailto:...", () => {
    const input = "ATTENDEE;CN=Sarah Chen:mailto:sarah@acme.com\n";
    const r = runCal(input, "parse", "-");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      { name: "Sarah Chen", email: "sarah@acme.com" },
    ]);
  });

  test("ignores blank lines and surrounding whitespace", () => {
    const r = runCal("\n  Sarah Chen <sarah@acme.com>  \n\n", "parse", "-");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      { name: "Sarah Chen", email: "sarah@acme.com" },
    ]);
  });

  test("handles empty input — emits []", () => {
    const r = runCal("", "parse", "-");
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```fish
bun test tests/onboard-calendar.test.ts
```

Expected: FAIL — `bin/onboard-calendar.ts` does not exist.

- [ ] **Step 3: Commit failing tests**

```fish
git add tests/onboard-calendar.test.ts
git commit -m "Add failing tests for onboard-calendar parser (#12)"
```

---

## Task 4 — Implement calendar parser

**Files:**
- Create: `bin/onboard-calendar.ts`

- [ ] **Step 1: Write the `parse` subcommand**

```typescript
#!/usr/bin/env bun
// onboard-calendar — Phase 4 paste-only calendar-watch helper.
//
// Subcommands:
//   parse <path | ->                     stdin or file → JSON event list
//   diff <events.json> <map.md>          unmatched invitees → JSON
//   paste <workspace>                    end-to-end: stdin → suggestions.md + stamp + NAGS append

import { readFileSync, writeFileSync, existsSync, statSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { extractNames } from "./onboard-guard.ts";

export type Event = { name: string; email: string | null };

// Precedence (most-specific → least-specific). Order is load-bearing —
// ICS lines are unambiguous; bracketed `<email>` lines must be tried before
// the freeform separator regex (which would otherwise consume the leading
// `<` as a separator and corrupt the email capture); bare-name fallback
// is last. Tests in tests/onboard-calendar.test.ts assert each branch.
const ICS_LINE = /^ATTENDEE;CN=(.+?):mailto:(.+)$/;
const BARE_EMAIL_BRACKET = /^(.+?)\s*<([^<>]+)>\s*$/;
const FREEFORM_NAME_EMAIL = /^(.+?)\s*[—\-]\s*([^\s<>—\-]+@[^\s<>]+)\s*$/;

export const parsePaste = (text: string): Event[] => {
  const events: Event[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    const ics = line.match(ICS_LINE);
    if (ics) {
      events.push({ name: ics[1]!.trim(), email: ics[2]!.trim() });
      continue;
    }

    const bracket = line.match(BARE_EMAIL_BRACKET);
    if (bracket) {
      events.push({ name: bracket[1]!.trim(), email: bracket[2]!.trim() });
      continue;
    }

    const sep = line.match(FREEFORM_NAME_EMAIL);
    if (sep) {
      events.push({ name: sep[1]!.trim(), email: sep[2]!.trim() });
      continue;
    }

    // Bare name (no email).
    events.push({ name: line, email: null });
  }
  return events;
};

const readInput = (pathOrDash: string): string => {
  if (pathOrDash === "-") {
    return readFileSync(0, "utf8"); // stdin
  }
  return readFileSync(pathOrDash, "utf8");
};

const cmdParse = (pathOrDash: string): number => {
  const events = parsePaste(readInput(pathOrDash));
  process.stdout.write(JSON.stringify(events) + "\n");
  return 0;
};

const main = (): number => {
  const [sub, ...args] = process.argv.slice(2);
  switch (sub) {
    case "parse":
      if (args.length !== 1) {
        process.stderr.write("usage: onboard-calendar parse <path | ->\n");
        return 64;
      }
      return cmdParse(args[0]!);
    case "diff":
      // Implemented in Task 6.
      process.stderr.write("diff not yet implemented\n");
      return 70;
    case "paste":
      // Implemented in Task 6.
      process.stderr.write("paste not yet implemented\n");
      return 70;
    default:
      process.stderr.write(`unknown subcommand: ${sub ?? "(none)"}\n`);
      return 64;
  }
};

if (import.meta.main) process.exit(main());
```

The `extractNames` import requires `bin/onboard-guard.ts` to keep its named export — verified at Task 2 step output. If `bunx tsc --noEmit` complains about the `.ts` extension on the import, drop the extension (Bun resolves both forms; `tsc` may need the bare form depending on `moduleResolution`).

- [ ] **Step 2: Run unit tests, confirm parser tests pass**

```fish
bun test tests/onboard-calendar.test.ts
```

Expected: all 6 parser tests PASS. `diff` and `paste` test branches (added in Task 5/6) don't exist yet.

- [ ] **Step 3: Type-check**

```fish
bunx tsc --noEmit
```

Expected: clean (`bin/**/*.ts` already in `tsconfig.include` per Phase 3 Task 2 step 3).

- [ ] **Step 4: Commit**

```fish
git add bin/onboard-calendar.ts
git commit -m "onboard-calendar: parse subcommand handles freeform + ICS-subset (#12)"
```

---

## Task 5 — Failing test + impl: `bin/onboard-status.ts` adds `calendar` to category allow-list

**Files:**
- Modify: `tests/onboard-status.test.ts`
- Modify: `bin/onboard-status.ts`

- [ ] **Step 1: Append failing test to the existing suite**

```typescript
test("--mute calendar persists in section body", async () => {
  const ws = await scaffoldFreshWorkspace(); // existing fixture helper
  const r1 = spawnSync("bun", ["run", SCRIPT, "--mute", "calendar", ws], { encoding: "utf8" });
  expect(r1.status).toBe(0);
  const ramp = readFileSync(join(ws, "RAMP.md"), "utf8");
  expect(ramp).toMatch(/^## Cadence Mutes\n\n- calendar\n/m);

  const r2 = spawnSync("bun", ["run", SCRIPT, "--unmute", "calendar", ws], { encoding: "utf8" });
  expect(r2.status).toBe(0);
  const after = readFileSync(join(ws, "RAMP.md"), "utf8");
  expect(after).toMatch(/^## Cadence Mutes\n\n\(none\)\n/m);
});
```

- [ ] **Step 2: Run, confirm fail**

```fish
bun test tests/onboard-status.test.ts
```

Expected: 1 FAIL — `unknown category: calendar` exit 2 (allow-list rejects).

- [ ] **Step 3: Extend the allow-list**

```typescript
// bin/onboard-status.ts
const CATEGORIES = ["milestone", "velocity", "calendar"] as const;
```

Update the misuse error string to match: `"unknown category: ${category} (allowed: milestone | velocity | calendar)"`.

- [ ] **Step 4: Run, confirm pass**

```fish
bun test tests/onboard-status.test.ts
```

Expected: all (Phase 2 + Phase 3 + 1 new Phase 4) tests PASS.

- [ ] **Step 5: Commit**

```fish
git add bin/onboard-status.ts tests/onboard-status.test.ts
git commit -m "onboard-status: add calendar to mute category allow-list (#12)"
```

---

## Task 6 — Failing test + impl: `diff` and `paste` subcommands

**Files:**
- Modify: `tests/onboard-calendar.test.ts`
- Modify: `bin/onboard-calendar.ts`

- [ ] **Step 1: Append failing tests for `diff` and `paste`**

```typescript
const writeMap = (ws: string, names: string[]): string => {
  const path = join(ws, "stakeholders", "map.md");
  const body =
    "# Stakeholder Map\n\n## Direct reports\n\n" +
    names.map((n) => `- ${n} — Engineer\n`).join("");
  writeFileSync(path, body);
  return path;
};

const makeWorkspace = (): string => {
  const root = mkdtempSync(join(tmpdir(), "onboard-cal-"));
  fixtures.push(root);
  mkdirSync(join(root, "stakeholders"), { recursive: true });
  mkdirSync(join(root, "interviews", "raw"), { recursive: true });
  // RAMP.md needed for the cron NAGS dedupe path; keep it minimal.
  writeFileSync(
    join(root, "RAMP.md"),
    "Started: 2026-04-01\n\n## Cadence Mutes\n\n(none)\n",
  );
  return root;
};

describe("bin/onboard-calendar.ts diff", () => {
  test("emits unmatched invitees only", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Sarah Chen", "Marcus Diaz"]);
    const events = JSON.stringify([
      { name: "Sarah Chen", email: "sarah@acme.com" },
      { name: "Priya Patel", email: "priya@acme.com" },
    ]);
    const eventsFile = join(ws, "events.json");
    writeFileSync(eventsFile, events);
    const r = runCal("", "diff", eventsFile, map);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([
      { name: "Priya Patel", email: "priya@acme.com" },
    ]);
  });

  test("matches case-insensitively on display name", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Sarah Chen"]);
    const events = JSON.stringify([{ name: "sarah chen", email: null }]);
    const eventsFile = join(ws, "events.json");
    writeFileSync(eventsFile, events);
    const r = runCal("", "diff", eventsFile, map);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  test("empty map.md returns all invitees as unmatched", () => {
    const ws = makeWorkspace();
    writeFileSync(join(ws, "stakeholders", "map.md"), "# Stakeholder Map\n\n");
    const events = JSON.stringify([{ name: "Sarah Chen", email: null }]);
    const eventsFile = join(ws, "events.json");
    writeFileSync(eventsFile, events);
    const r = runCal("", "diff", eventsFile, join(ws, "stakeholders", "map.md"));
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([{ name: "Sarah Chen", email: null }]);
  });

  test("reads events from stdin when first arg is '-' (pipe-chain support)", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Sarah Chen"]);
    const events = JSON.stringify([
      { name: "Sarah Chen", email: null },
      { name: "Priya Patel", email: null },
    ]);
    const r = runCal(events, "diff", "-", map);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([{ name: "Priya Patel", email: null }]);
  });
});

describe("bin/onboard-calendar.ts paste (end-to-end)", () => {
  test("writes suggestions.md, stamp file, and single NAGS line", () => {
    const ws = makeWorkspace();
    writeMap(ws, ["Sarah Chen"]);
    const r = runCal(
      "Sarah Chen <sarah@acme.com>\nPriya Patel <priya@acme.com>\n",
      "paste",
      ws,
    );
    expect(r.exitCode).toBe(0);

    const suggestions = readFileSync(join(ws, "calendar-suggestions.md"), "utf8");
    expect(suggestions).toContain("Priya Patel");
    expect(suggestions).not.toContain("Sarah Chen");

    const stamp = readFileSync(join(ws, ".calendar-last-paste"), "utf8").trim();
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const nags = readFileSync(join(ws, "NAGS.md"), "utf8");
    const today = new Date().toISOString().slice(0, 10);
    expect(nags).toContain(`${today}  calendar  1 new invitee pending review`);
  });

  test("zero unmatched → no suggestions file written, NAGS line still informs zero", () => {
    const ws = makeWorkspace();
    writeMap(ws, ["Sarah Chen"]);
    const r = runCal("Sarah Chen <sarah@acme.com>\n", "paste", ws);
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(ws, "calendar-suggestions.md"))).toBe(false);
    const nags = readFileSync(join(ws, "NAGS.md"), "utf8");
    expect(nags).toContain("calendar  0 new invitees");
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```fish
bun test tests/onboard-calendar.test.ts
```

Expected: 5 new tests FAIL (diff + paste branches return exit 70).

- [ ] **Step 3: Implement `diff` and `paste` in `bin/onboard-calendar.ts`**

```typescript
export const diffEvents = (events: Event[], mapMarkdown: string): Event[] => {
  const known = new Set(extractNames(mapMarkdown).map((n) => n.toLowerCase()));
  return events.filter((e) => !known.has(e.name.toLowerCase()));
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const cmdDiff = (eventsPathOrDash: string, mapPath: string): number => {
  const eventsJson = readInput(eventsPathOrDash); // '-' = stdin, else file
  const events = JSON.parse(eventsJson) as Event[];
  const map = readFileSync(mapPath, "utf8");
  const unmatched = diffEvents(events, map);
  process.stdout.write(JSON.stringify(unmatched) + "\n");
  return 0;
};

const formatSuggestions = (unmatched: Event[]): string => {
  const lines = unmatched.map((e) =>
    e.email ? `- ${e.name} <${e.email}>` : `- ${e.name}`,
  );
  return (
    `# Calendar invitee suggestions — ${todayIso()}\n\n` +
    `Unmatched invitees from latest paste. Review and add to ` +
    `\`stakeholders/map.md\` if appropriate.\n\n` +
    lines.join("\n") +
    "\n"
  );
};

const appendNagDeduped = (
  nagsPath: string,
  date: string,
  detail: string,
): void => {
  // Phase 2 dedupe contract: same date + class + detail prefix → skip.
  const prefix = `${date}  calendar  `;
  let existing = "";
  if (existsSync(nagsPath)) existing = readFileSync(nagsPath, "utf8");
  for (const line of existing.split("\n")) {
    if (line.startsWith(prefix)) return;
  }
  appendFileSync(nagsPath, `${prefix}${detail}\n`);
};

const cmdPaste = (workspace: string): number => {
  const mapPath = join(workspace, "stakeholders", "map.md");
  if (!existsSync(mapPath)) {
    process.stderr.write(`no stakeholders/map.md at ${workspace}\n`);
    return 1;
  }
  const events = parsePaste(readInput("-"));
  const map = readFileSync(mapPath, "utf8");
  const unmatched = diffEvents(events, map);
  const date = todayIso();

  if (unmatched.length > 0) {
    writeFileSync(
      join(workspace, "calendar-suggestions.md"),
      formatSuggestions(unmatched),
    );
  }
  writeFileSync(join(workspace, ".calendar-last-paste"), `${date}\n`);

  const noun = unmatched.length === 1 ? "invitee" : "invitees";
  appendNagDeduped(
    join(workspace, "NAGS.md"),
    date,
    `${unmatched.length} new ${noun} pending review (see calendar-suggestions.md)`,
  );
  return 0;
};
```

Wire the new branches into `main()`:

```typescript
    case "diff":
      if (args.length !== 2) {
        process.stderr.write("usage: onboard-calendar diff <events.json | -> <map.md>\n");
        return 64;
      }
      return cmdDiff(args[0]!, args[1]!);
    case "paste":
      if (args.length !== 1) {
        process.stderr.write("usage: onboard-calendar paste <workspace>\n");
        return 64;
      }
      return cmdPaste(args[0]!);
```

- [ ] **Step 4: Run, confirm pass**

```fish
bun test tests/onboard-calendar.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Type-check + skill validate**

```fish
bunx tsc --noEmit
fish validate.fish
```

Expected: clean.

- [ ] **Step 6: Commit**

```fish
git add bin/onboard-calendar.ts tests/onboard-calendar.test.ts
git commit -m "onboard-calendar: diff + paste subcommands (#12)"
```

---

## Task 7 — Wire `cadence-nags.md` calendar-stale Monday-only check

**Files:**
- Modify: `skills/onboard/cadence-nags.md`

**Verify-gap acknowledgement (Karpathy #4 honesty):** the cadence-nag autonomous session is described in markdown for an LLM to follow at cron-fire time, NOT a script with a unit-testable surface. `fish validate.fish` checks structural anchors only (presence of expected H2 headers, no broken markdown links); it does NOT execute the protocol. The Monday-only branch, the `.calendar-last-paste` mtime read, and the dedupe behavior are FUNDAMENTALLY NOT UNIT-TESTABLE in this architecture. Coverage rests on (a) careful prose review at PR time, (b) the `bin/onboard-calendar.ts` paste path EMITS the file the cron reads (so the producer side IS unit-tested in Task 6), (c) post-merge live observation of the first Monday fire. This gap is intentional (cron-as-LLM-prompt was a Phase 2 design choice) and is not closed by Phase 4.

- [ ] **Step 1: Renumber the existing Step 5 to Step 6, then insert the new Step 5**

The existing `cadence-nags.md` autonomous-session protocol numbers the liveness-stamp step as `5.` and the constraints block as `6.`. To insert the calendar-stale check between the velocity check (Step 4) and the liveness stamp WITHOUT introducing a `4.5` (Markdown ordered lists do not render fractional indices), renumber: existing Step 5 → Step 6 (liveness stamp), existing Step 6 → Step 7 (constraints). Adjust any prose cross-references in the file. Then insert the new Step 5 between Step 4 (velocity) and the renumbered Step 6 (liveness stamp).

After renumber, the file's tail reads:

```
6. After the checks (whether or not anything was appended), update a
   liveness stamp at {{WORKSPACE_ABS_PATH}}/.cadence-last-fire …

7. Constraints:
   - Workspace path is absolute. Treat any relative path as a bug; abort.
   …
```

Then insert above the renumbered Step 6:

```markdown
5. **Calendar-stale check** (skip if `calendar` is muted):

   Mondays only — if `today.getDay() !== 1` (where 0=Sun, 1=Mon), skip
   this step entirely. The check is a weekly nudge, not daily, to avoid
   burying NAGS.md.

   Read `<workspace>/.calendar-last-paste`:
   - If missing → build the candidate line:

         <ISO date>  calendar  paste new invitee summary (no paste yet)

   - If present, parse the single ISO date line. If `today - paste_date >= 7d`,
     build:

         <ISO date>  calendar  paste new invitee summary (last paste N+ days ago)

     where N is the integer day count.

   - If present and < 7 days stale, do not nag.

   Dedupe by grepping NAGS.md for the exact prefix `<ISO date>  calendar`
   (two-space delimiter, literal). If any match for today, skip.

   The autonomous worker MUST NOT invoke `/onboard --calendar-paste`,
   `mcp__5726bf10-…__list_events`, or any HTTP/MCP call. Calendar paste
   is foreground user-initiated only. The cron's job is to remind, not to
   scan.
```

- [ ] **Step 2: Update § "What this doc deliberately does NOT cover"**

Drop the bullet `- Calendar-watch nag class — Phase 4.` Replace with `- Calendar live MCP scan — deferred (Phase 4 ships paste-only; live scan in a later phase).`

- [ ] **Step 3: Validate**

```fish
fish validate.fish
```

Expected: PASS.

- [ ] **Step 4: Commit**

```fish
git add skills/onboard/cadence-nags.md
git commit -m "cadence-nags: add Monday-only calendar-stale check (Phase 4) (#12)"
```

---

## Task 8 — Write `skills/onboard/calendar-paste.md` (canonical reference)

**Files:**
- Create: `skills/onboard/calendar-paste.md`

- [ ] **Step 1: Write the doc**

```markdown
# Calendar Paste — Phase 4 (Q3-C: paste-only)

`/onboard --calendar-paste <workspace>` reads a calendar attendee summary from
stdin, parses it, diffs against `<workspace>/stakeholders/map.md`, and writes
unmatched invitees to `<workspace>/calendar-suggestions.md` for user review.

Phase 4 is paste-only by design (Q3-C). Live MCP scan via
`mcp__5726bf10-…__list_events` is deferred to a later phase — the autonomous
cron worker MUST NOT call MCP tools; foreground Claude sessions can layer a
`--calendar-scan` wrapper that emits paste-format and pipes into this helper.

## Paste format

The parser tolerates three line shapes per attendee, blank lines ignored,
surrounding whitespace trimmed:

| Shape | Example |
|---|---|
| Freeform `<email>` | `Sarah Chen <sarah@acme.com>` |
| Freeform separator | `Sarah Chen — sarah@acme.com` (em-dash, hyphen, or `<`) |
| Bare name | `Sarah Chen` (email becomes `null`) |
| ICS subset | `ATTENDEE;CN=Sarah Chen:mailto:sarah@acme.com` |

Mixed shapes within a single paste are fine. Order is preserved.

## Diff key (Phase 4 limitation)

Match is **display-name only**, case-insensitive, against names extracted from
`stakeholders/map.md` via `bin/onboard-guard.ts` `extractNames()` (the same
helper Phase 3 uses for attribution-check; single source of truth).

**Residual risks** (same bucket as Phase 3 attribution-check):

- Nicknames: paste says `Sarah`, map.md has `Sarah Chen` — false-positive
  unmatched.
- Misspellings: paste says `Sara Chen` — false-positive unmatched.
- Email-only match — NOT supported in Phase 4 (map.md has no email column
  today; schema extension deferred to Phase 5+).

False-positive unmatched is the safe failure mode (over-flag, never silently
miss). User reviews `calendar-suggestions.md` and cherry-picks into
`stakeholders/map.md`.

## Suggestions file

`<workspace>/calendar-suggestions.md` is review-friendly markdown. New paste
runs OVERWRITE the file (not append) — it represents the current snapshot,
not history. Format:

```markdown
# Calendar invitee suggestions — <ISO date>

Unmatched invitees from latest paste. Review and add to
`stakeholders/map.md` if appropriate.

- Priya Patel <priya@acme.com>
- Diego Lopez
```

When zero invitees are unmatched, the file is NOT written (avoid stale empty
files).

## Staleness contract

`<workspace>/.calendar-last-paste` holds a single ISO date line, written on
every paste run regardless of unmatched count. The cadence-nag autonomous
worker reads this on Monday-fires (only) and nags when missing or 7+ days
stale. See [`cadence-nags.md`](cadence-nags.md) Step 4.5.

## NAGS.md integration

Each paste run appends ONE summary line to `<workspace>/NAGS.md`:

    <ISO date>  calendar  N new invitee(s) pending review (see calendar-suggestions.md)

Subject to the Phase 2 dedupe contract — re-running paste on the same day
does NOT duplicate the line. Per-invitee detail lines live in
`calendar-suggestions.md`, not NAGS.md.

## Override semantics

None. Paste is purely user-initiated; there is no gate that the user can
override. If the user disagrees with an unmatched flag, they edit
`calendar-suggestions.md` (or ignore it) directly.

## What this flow deliberately does NOT do

- Call MCP / HTTP / Calendar APIs from any context (paste-only, Phase 4).
- Modify `stakeholders/map.md` (suggestions are user-cherry-picked).
- Match on email (Phase 5+ schema extension required).
- Cluster invitees across multiple meetings (single-paste snapshot).
- Distinguish recurring from one-shot meetings (out of scope; user decides
  whether to add to map.md).
- Auto-archive old `calendar-suggestions.md` versions (file is overwritten
  per run; user's git history preserves prior suggestions if needed).
```

- [ ] **Step 2: Validate**

```fish
fish validate.fish
```

Expected: PASS.

- [ ] **Step 3: Commit**

```fish
git add skills/onboard/calendar-paste.md
git commit -m "onboard: add calendar-paste reference doc (Phase 4) (#12)"
```

---

## Task 9 — Wire `/onboard` SKILL.md `--calendar-paste` dispatch + scope-doc trim

**Files:**
- Modify: `skills/onboard/SKILL.md`

- [ ] **Step 1: Add the `--calendar-paste` dispatch section**

Insert after the `## Pre-render attribution gate (Phase 3)` section, before `## Backtracking`:

```markdown
## Calendar paste (Phase 4)

`/onboard --calendar-paste <workspace>` reads a Calendar attendee summary
from stdin, parses it, diffs against `<workspace>/stakeholders/map.md`, and
writes unmatched invitees to `<workspace>/calendar-suggestions.md` for user
review. The cron-fired cadence-nag worker reminds on Mondays when paste is
7+ days stale.

```fish
# Common usage — paste from clipboard, pipe to helper
pbpaste | bun run "$CLAUDE_PROJECT_DIR/bin/onboard-calendar.ts" paste <workspace>
```

(`CLAUDE_PROJECT_DIR` is harness-provided; if unset, walk up from CWD until
a `.git` directory is found.)

Paste-only is Phase 4 by design (live MCP scan deferred). See
[calendar-paste.md](calendar-paste.md) for the format taxonomy, diff-key
limitations, suggestions-file shape, and override semantics. Mute via
`/onboard --mute calendar` per the existing status helper.
```

- [ ] **Step 2: Update line 73 (mute-syntax) — drop the "(`calendar` is Phase 4.)" parenthetical**

The current line reads:

```
Categories: `milestone` | `velocity`. (`calendar` is Phase 4.) Mute state persists in
```

Change to:

```
Categories: `milestone` | `velocity` | `calendar`. Mute state persists in
```

- [ ] **Step 3: Update `## What this skill deliberately does NOT do (yet)`**

Drop the `- Calendar API integration (Phase 4)` bullet. The section should now read:

```markdown
## What this skill deliberately does NOT do (yet)

- Live Calendar API/MCP scan — Phase 4 ships paste-only; live scan deferred
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
git commit -m "onboard: wire --calendar-paste; drop Phase 4 from 'does NOT do' (#12)"
```

---

## Task 10 — Update `refusal-contract.md` (drop symlink limitation)

**Files:**
- Modify: `skills/onboard/refusal-contract.md`

- [ ] **Step 1: Update detection-rule paragraph**

The current paragraph (line 17–19) reads:

> Detection rule: the absolute path of the argument contains the literal segment
> `/interviews/raw/` anywhere. Symlink traversal is NOT followed (Phase 3 limitation,
> see "What Phase 4 picks up").

Replace with:

> Detection rule: the path is resolved via `realpathSync` before the
> `/interviews/raw/` segment check. Symlinks pointing at raw notes refuse;
> broken symlinks (target missing) refuse as the safer default.

- [ ] **Step 2: Update § "What this contract deliberately does NOT cover"**

Drop the bullet `- Symlink-to-raw traversal (Phase 4 hardening).`. The remaining bullets stand.

- [ ] **Step 3: Validate**

```fish
fish validate.fish
```

Expected: PASS.

- [ ] **Step 4: Commit**

```fish
git add skills/onboard/refusal-contract.md
git commit -m "refusal-contract: drop symlink-hardening Phase 4 deferral (now done) (#12)"
```

---

## Task 11 — Cross-skill integration test (load-bearing Phase 4 verify)

**Files:**
- Modify: `tests/onboard-integration.test.ts`

- [ ] **Step 1: Append a new describe block**

```typescript
describe("Phase 4 calendar paste", () => {
  test("scaffold + map.md seed + freeform paste → suggestions + stamp + NAGS", () => {
    const ws = scaffoldWorkspace("acme");
    // Seed map.md with one stakeholder.
    const mapPath = join(ws, "stakeholders", "map.md");
    const existing = readFileSync(mapPath, "utf8");
    writeFileSync(
      mapPath,
      existing + "\n## Direct reports\n\n- Sarah Chen — Senior Engineer\n",
    );

    const cal = join(REPO, "bin", "onboard-calendar.ts");
    const r = spawnSync(
      "bun",
      ["run", cal, "paste", ws],
      {
        input: "Sarah Chen <sarah@acme.com>\nPriya Patel <priya@acme.com>\n",
        encoding: "utf8",
      },
    );
    expect(r.status).toBe(0);

    const suggestions = readFileSync(join(ws, "calendar-suggestions.md"), "utf8");
    expect(suggestions).toContain("Priya Patel");
    expect(suggestions).not.toContain("Sarah Chen");

    const stamp = readFileSync(join(ws, ".calendar-last-paste"), "utf8").trim();
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const nags = readFileSync(join(ws, "NAGS.md"), "utf8");
    const today = new Date().toISOString().slice(0, 10);
    expect(nags).toContain(`${today}  calendar  1 new invitee pending review`);
  });

  test("re-running paste on same day does not duplicate NAGS line", () => {
    const ws = scaffoldWorkspace("acme");
    writeFileSync(
      join(ws, "stakeholders", "map.md"),
      "# Stakeholder Map\n\n## Direct reports\n\n- Sarah Chen — SE\n",
    );
    const cal = join(REPO, "bin", "onboard-calendar.ts");
    const input = "Priya Patel <priya@acme.com>\n";

    spawnSync("bun", ["run", cal, "paste", ws], { input, encoding: "utf8" });
    spawnSync("bun", ["run", cal, "paste", ws], { input, encoding: "utf8" });

    const nags = readFileSync(join(ws, "NAGS.md"), "utf8");
    const today = new Date().toISOString().slice(0, 10);
    const matches = nags.split("\n").filter((l) =>
      l.startsWith(`${today}  calendar  `),
    );
    expect(matches.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run, confirm pass**

```fish
bun test tests/onboard-integration.test.ts
```

Expected: all (Phase 3 + 2 new Phase 4) tests PASS.

- [ ] **Step 3: Run full suite + typecheck + validate**

```fish
bun test tests/
bunx tsc --noEmit
fish validate.fish
```

Expected: all PASS — Phase 1 + 2 + 3 tests still green; Phase 4 unit + integration green.

- [ ] **Step 4: Commit**

```fish
git add tests/onboard-integration.test.ts
git commit -m "onboard: add Phase 4 calendar paste integration tests (#12)"
```

- [ ] **Step 5: Open implementation PR (manual — separate from THIS plan PR)**

Use a `/tmp/onboard-phase4-pr.md` body file (no heredoc; user is on fish):

```fish
echo "## Summary
Phase 4 of /onboard: Calendar-watch paste-only integration + Phase 3 carry-overs.
- bin/onboard-calendar.ts (parse / diff / paste subcommands)
- bin/onboard-guard.ts realpath-resolve refuse-raw (symlink hardening)
- bin/onboard-status.ts adds calendar to mute category allow-list
- skills/onboard/cadence-nags.md gains Monday-only calendar-stale check (no MCP from cron)
- /onboard --calendar-paste <workspace> SKILL.md dispatch + calendar-paste.md reference

## Test plan
- [ ] bun test tests/onboard-calendar.test.ts (parser + diff + paste unit tests)
- [ ] bun test tests/onboard-guard.test.ts (existing + 3 symlink tests)
- [ ] bun test tests/onboard-status.test.ts (existing + 1 calendar-mute test)
- [ ] bun test tests/onboard-integration.test.ts (existing Phase 3 + 2 Phase 4 calendar)
- [ ] bun test tests/onboard-scaffold.test.ts (Phase 1 untouched)
- [ ] bunx tsc --noEmit clean
- [ ] fish validate.fish PASS
- [ ] Manual: scaffold a throwaway workspace, seed map.md, pipe a freeform paste, verify suggestions.md + .calendar-last-paste + NAGS.md
- [ ] Manual: re-run paste same-day, verify NAGS dedupe holds (one calendar line)
- [ ] Manual: ln -s interviews/raw/sarah.md /tmp/notes.md; bun run bin/onboard-guard.ts refuse-raw /tmp/notes.md → exit 2

## Out of scope (Phase 5+)
- Live Calendar MCP/HTTP scan from foreground (--calendar-scan wrapper)
- map.md schema extension for email-match
- Attribution residual risks (nicknames, misspellings, pronouns)
- Theme clustering in --sanitize (punted to /swot)
- --graduate retro + archive

🤖 Generated with [Claude Code](https://claude.com/claude-code)" > /tmp/onboard-phase4-pr.md

git push -u origin feature/onboard-phase-4
gh pr create --title "/onboard Phase 4 — calendar-watch paste + symlink hardening (#12)" --body-file /tmp/onboard-phase4-pr.md
```

---

## Self-Review Checklist (run after writing the code, before opening the implementation PR)

1. **Spec coverage** — every Phase 4 line in spec § "Implementation Phases" line 173 + § "Lag Detection" calendar-watch (line 143) is covered:
   - Calendar-watch with paste-fallback ✅ (Tasks 3, 4, 6, 7, 8, 9, 11)
   - Graceful degrade when API unavailable ✅ (paste-only IS the graceful-degrade default; no API surface to fail)
   - Mute syntax `--mute calendar` ✅ (Task 5)
   - ~100 LOC budget — calendar helper ~120 LOC, guard patch ~10 LOC, status patch ~3 LOC; total ~135 LOC functional + ~120 LOC tests + ~150 lines of new docs (docs not code)

2. **Q3 resolution traceable** — chosen C (paste-only); MCP / OAuth deferred to later. Trade-off matrix in plan + interpretation anchor in plan + `calendar-paste.md` "What this flow deliberately does NOT do" + SKILL.md "does NOT do (yet)" all consistent. If a future reviewer flips Q3 to B/MCP, the implementation re-scopes (does not silently drift).

3. **Carry-over decisions traceable** — bundle-vs-defer table (in interpretation anchors) is mirrored by:
   - Symlink hardening: IN → Tasks 1+2 + `refusal-contract.md` line edit (Task 10)
   - Attribution residuals: DEFER → `What Phase 5 picks up` section + `calendar-paste.md` "Residual risks" section
   - Theme clustering: PUNT to /swot → `What Phase 5 picks up` section
   No silent bundling.

4. **Cron tool surface unchanged** — `cadence-nags.md` Step 4.5 only reads `<workspace>/.calendar-last-paste` mtime + appends to NAGS.md. NO MCP calls, NO HTTP, NO `find` over `interviews/raw/` (Phase 3 boundary still holds). Verify with grep:
   - `grep -n "mcp__\|fetch(\|http" skills/onboard/cadence-nags.md` → zero matches inside Step 4.5 body.
   - The Step 4.5 body explicitly states the constraint: "MUST NOT invoke `/onboard --calendar-paste`, `mcp__5726bf10-…__list_events`, or any HTTP/MCP call."

5. **Single source of truth for stakeholder-name parsing** — `bin/onboard-calendar.ts diff` imports `extractNames` from `bin/onboard-guard.ts`. Verify with grep:
   - `grep -n "extractNames" bin/*.ts` → 2 lines (one definition in `onboard-guard.ts`, one import in `onboard-calendar.ts`). No duplicate regex.
   - `grep -n "isInsideRaw\b" bin/ tests/ skills/` → ZERO matches (the old string-based export was deleted in Task 2; no callers were using it). Single canonical resolver `checkPath()` returns a `RawCheck` discriminated union.

5a. **SOLID + Karpathy compliance** (added 2026-04-30 plan-amendment review):
   - **SRP** — `parsePaste / diffEvents / formatSuggestions / appendNagDeduped` decomposed; `cmdPaste` is the orchestrator only (no business logic inline).
   - **OCP** — `CATEGORIES` tuple in `onboard-status.ts` is closed for modification; one-line additive extension is the right shape at this enum size (over-engineering to abstract).
   - **ISP** — three subcommands independently invocable. Both `parse` and `diff` accept `-` for stdin, enabling pipe chains (`cal parse - <paste.txt | cal diff - map.md`). Internal consistency.
   - **DIP** — file I/O direct via `node:fs`; no injection (correct for a CLI helper, would be over-engineering otherwise).
   - **Karpathy #2 Simplicity** — old `isInsideRaw()` deleted (no callers, no speculative API surface). One canonical `checkPath()` resolver.
   - **Karpathy #3 Surgical** — Step renumber in `cadence-nags.md` is 5→6 + 6→7, no fractional indices. Single realpath try/catch in `checkPath()`, no DRY duplication.
   - **Karpathy #4 Goal-Driven verify-gap** — Task 7 cron protocol cannot be unit-tested (markdown-for-LLM, no script surface). Acknowledged explicitly in Task 7 preamble; producer side IS unit-tested in Task 6 (paste path emits the file the cron reads). Coverage gap intentional, not closed by Phase 4.

6. **Phase 2 dedupe contract honored** — paste run appends a SINGLE NAGS line per day, dedupe-keyed by `<ISO date>  calendar  ` prefix (literal two-space delimiter, NOT a regex). Re-running paste same-day does not duplicate (Task 11 step 1 second test asserts this). Per-invitee detail lives in `calendar-suggestions.md`, not NAGS.md.

7. **Placeholder scan** — no `TBD` / `TODO` in code, plan, or new reference docs.

8. **Type consistency across calendar surfaces** — flag/category names match across:
   - `bin/onboard-calendar.ts` (`calendar` literal in NAGS prefix + suggestions filename)
   - `bin/onboard-status.ts` (`CATEGORIES` tuple includes `calendar`)
   - `skills/onboard/cadence-nags.md` (Step 4.5 body uses `calendar` class)
   - `skills/onboard/calendar-paste.md` (NAGS.md format example)
   - `skills/onboard/SKILL.md` (mute syntax line + dispatch section)

9. **Phase boundary respected** — no `--graduate` (Phase 5), no live MCP scan (deferred), no map.md schema extension (deferred), no attribution residual fixes (deferred). `/1on1-prep` SKILL.md and `/swot` SKILL.md and `/present` SKILL.md NOT modified.

10. **No Phase 1 / 2 / 3 regression** — `tests/onboard-scaffold.test.ts`, `tests/onboard-status.test.ts` (Phase 2 + 3 baseline), `tests/onboard-guard.test.ts` (Phase 3 baseline) all run unchanged in scope; the only modifications are ADDITIVE (new tests). `bin/onboard-scaffold.fish` not modified. `skills/onboard/capture-and-sanitize.md` not modified.

11. **Memory hooks honored**:
    - `onboard_fish_vs_ts_inflection.md` — calendar parse/diff is parse/transform load → TS, not fish. `bin/onboard-calendar.ts` is TypeScript ✅
    - `onboarding_toolkit_manual_first.md` — paste is user-initiated; live MCP scan deferred; manual-first preserved ✅
    - `onboard_skill_rescoped.md` — calendar wiring lives in `/onboard`, not bolted onto `/stakeholder-map`. Suggestions are user-cherry-picked into `map.md`, not auto-written ✅
    - `user_situation.md` — Calendar + Gmail only; paste-format works for both Google Calendar attendee copy AND Gmail meeting-summary paste ✅

12. **Cross-skill integration test is load-bearing** — Task 11's tests exercise the full chain: real scaffold → real map.md seed → real helper invocation → assert suggestions + stamp + NAGS. A regression in any single piece (parser drift, diff key drift, suggestions filename drift, NAGS dedupe drift, stamp filename drift) fails this test loudly. Generic unit tests on the parser alone would not catch a SKILL.md drift where the helper is called with the wrong path arg.

13. **Refusal contract update is consistent** — `refusal-contract.md` detection-rule paragraph (Task 10) matches `bin/onboard-guard.ts` actual behavior (realpath before segment check). Phase 4 picks-up list in `What Phase 5 picks up` no longer mentions symlink (now done) or Calendar (now shipped paste-only).

---

## What Phase 5 picks up

- **`/onboard --graduate <org>`** — final retrospective + archive. Run final retro prompt → write `decisions/retro.md`; archive workspace via `git tag ramp-graduated-<date>` + push to remote (if configured); unschedule the cadence-nag MCP task via `mcp__scheduled-tasks__update_scheduled_task` or deletion equivalent. Detect prior graduation on re-invoke and warn. ~60 LOC per spec line 174.
- **Live Calendar MCP scan** — `/onboard --calendar-scan <workspace>` foreground wrapper. Calls `mcp__5726bf10-…__list_events` from a Claude session (NOT cron), formats events as paste-format lines, pipes into `bin/onboard-calendar.ts paste`. Reuses everything in Phase 4. No autonomous-cron tool-surface widening.
- **Map.md schema extension for email-match** — additive `<email@…>` after role separator. Calendar diff prefers email when both are present; falls back to display name. Backward-compatible. Eliminates several attribution residual-risk classes (nicknames OK if email matches).
- **Attribution-check residual risks** — pull aliases from the memory-MCP person entity that `/stakeholder-map` populates (richer context than `map.md`). Add a heuristic for first-name-only matches against a common-name allowlist. Nickname / misspelling tolerance via Levenshtein distance ≤ 2 against alias table. Pronoun and possessive heuristics still likely deferred (cost > value at current scale).
- **Cross-1:1 theme clustering** — implement in `/swot` at W6 synthesis, NOT in `/onboard --sanitize`. The `--sanitize` step stays per-file. `/swot` reads all of `interviews/sanitized/` and clusters themes for the SWOT v1 draft.
- **Refusal contract surfaced to non-repo skills** — when (if) a marketplace plugin or external skill consumes `interviews/sanitized/`, the contract must be re-asserted at the call-site. No-op today (zero non-repo consumers).

Phase 5's plan ships in `docs/superpowers/plans/<date>-onboard-phase-5.md` once Phase 4 lands.

---

## SKILL.md "deliberately does NOT do (yet)" — post-Phase-4 target

After Task 9, the section reads:

```markdown
## What this skill deliberately does NOT do (yet)

- Live Calendar API/MCP scan — Phase 4 ships paste-only; live scan deferred
- `--graduate` retro + archive, including unscheduling the cadence task (Phase 5)
```

The Phase 4 entry (`Calendar API integration (Phase 4)`) is dropped because Phase 4 ships the paste path. The "live scan deferred" line replaces it to set expectation that MCP is a future layer.
