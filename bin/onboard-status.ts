#!/usr/bin/env bun
// Inspect or mute cadence nags for an /onboard workspace.
//
// Usage:
//   bin/onboard-status.ts --status   <workspace-path>
//   bin/onboard-status.ts --mute     <category> <workspace-path>
//   bin/onboard-status.ts --unmute   <category> <workspace-path>
//
// Categories: milestone | velocity | calendar

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

type Mode = "status" | "mute" | "unmute";

const CATEGORIES = ["milestone", "velocity", "calendar"] as const;
type Category = (typeof CATEGORIES)[number];

const die = (msg: string, code: number): never => {
  process.stderr.write(msg + "\n");
  process.exit(code);
};

type ParsedArgs = { mode: Mode; category: string | undefined; ws: string };

const parseArgs = (argv: string[]): ParsedArgs => {
  let mode: Mode | undefined;
  let category: string | undefined;
  let ws: string | undefined;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === "--status") {
      mode = "status";
      i++;
      ws = argv[i];
    } else if (arg === "--mute" || arg === "--unmute") {
      mode = arg.slice(2) as Mode;
      i++;
      category = argv[i];
      i++;
      ws = argv[i];
    } else {
      die(`unknown arg: ${arg}`, 2);
    }
    i++;
  }

  if (!mode) die("missing workspace path", 2);
  if (!ws) die("missing workspace path", 2);
  return { mode: mode!, category, ws: ws! };
};

const isCategory = (c: string | undefined): c is Category =>
  c !== undefined && (CATEGORIES as readonly string[]).includes(c);

const sectionBounds = (lines: string[]): { head: number; end: number } => {
  const head = lines.findIndex((l) => l === "## Cadence Mutes");
  if (head < 0) return { head: -1, end: -1 };
  let end = lines.length;
  for (let i = head + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith("## ")) {
      end = i;
      break;
    }
  }
  return { head, end };
};

const editMutes = (
  original: string,
  category: Category,
  mode: "mute" | "unmute",
): string => {
  const lines = original.split("\n");
  const { head, end } = sectionBounds(lines);

  const body = lines.slice(head + 1, end);
  // Strip leading and trailing blank lines from the body before edit.
  let lead = 0;
  while (lead < body.length && body[lead] === "") lead++;
  let tail = body.length;
  while (tail > lead && body[tail - 1] === "") tail--;
  const content = body.slice(lead, tail).filter((l) => l !== "(none)");
  const list = content.filter((l) => /^- /.test(l));
  const entry = `- ${category}`;

  if (mode === "mute") {
    if (!list.includes(entry)) list.push(entry);
  } else {
    const idx = list.indexOf(entry);
    if (idx >= 0) list.splice(idx, 1);
  }

  const newContent = list.length === 0 ? ["(none)"] : list;
  const newBody = ["", ...newContent, ""];
  const newLines = [
    ...lines.slice(0, head + 1),
    ...newBody,
    ...lines.slice(end),
  ];
  let result = newLines.join("\n");
  if (!result.endsWith("\n")) result += "\n";
  return result;
};

const printStatus = (ws: string, original: string): number => {
  const startedMatch = original.match(/^Started:\s*([0-9-]+)/m);
  const started = startedMatch?.[1];
  if (!started) {
    die(
      `RAMP.md at ${join(ws, "RAMP.md")} is missing a 'Started: YYYY-MM-DD' line`,
      1,
    );
  }
  const startedDate = new Date(`${started}T00:00:00`);
  if (isNaN(startedDate.getTime())) {
    die(
      `RAMP.md 'Started:' value '${started}' is not a parseable YYYY-MM-DD date`,
      1,
    );
  }
  const elapsed = Math.floor(
    (Date.now() - startedDate.getTime()) / 86_400_000,
  );
  if (elapsed < 0) {
    die(
      `RAMP.md 'Started:' value '${started}' is in the future (elapsed=${elapsed} days)`,
      1,
    );
  }

  process.stdout.write(`Workspace: ${ws}\n`);
  process.stdout.write(`Elapsed:   ${elapsed} days\n`);

  const nextMatch = original.match(/\| (W[0-9]+) \| ([^|]+?)\s*\| \[ \]/);
  if (nextMatch) {
    process.stdout.write(`Next milestone: ${nextMatch[2]} (${nextMatch[1]})\n`);
  } else {
    process.stdout.write(`Next milestone: (all checked)\n`);
  }

  process.stdout.write(`\nMutes:\n`);
  const lines = original.split("\n");
  const { head, end } = sectionBounds(lines);
  const body = lines.slice(head + 1, end);
  const muteLines = body.filter((l) => l.startsWith("- "));
  if (muteLines.length === 0) {
    process.stdout.write(`  (none)\n`);
  } else {
    for (const l of muteLines) process.stdout.write(`${l}\n`);
  }
  return 0;
};

const printGraduated = (ws: string, gradPath: string): number => {
  const raw = readFileSync(gradPath, "utf8").trim();
  const date = raw.split("\n")[0] ?? "";
  if (date.length === 0) {
    process.stderr.write(
      `${gradPath} exists but is empty — graduation date missing.\n` +
      `Inspect with \`cat ${gradPath}\`; rewrite with the ISO date the ramp ` +
      `was graduated, or delete the file to ungraduate.\n`,
    );
    return 1;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    process.stderr.write(
      `${gradPath} first line is not an ISO YYYY-MM-DD date: '${date}'.\n` +
      `Inspect with \`cat ${gradPath}\`; sentinel may be corrupted.\n`,
    );
    return 1;
  }
  process.stdout.write(`Workspace: ${ws}\n`);
  process.stdout.write(`Status: graduated ${date}\n`);
  return 0;
};

const main = (): number => {
  const { mode, category, ws } = parseArgs(process.argv.slice(2));

  // Phase 5: graduated short-circuit. The .graduated sentinel marks a
  // ramp as closed; --status surfaces the graduation date and skips the
  // live-ramp summary. --mute / --unmute fall through to existing
  // behavior (the user may still need to edit RAMP.md mutes during a
  // post-graduation re-open).
  const gradPath = join(ws, ".graduated");
  if (mode === "status" && existsSync(gradPath)) {
    return printGraduated(ws, gradPath);
  }

  const rampPath = join(ws, "RAMP.md");
  if (!existsSync(rampPath)) die(`no RAMP.md at ${ws}`, 1);

  if (mode === "mute" || mode === "unmute") {
    if (!isCategory(category)) {
      die(
        `unknown category: ${category} (allowed: milestone | velocity | calendar)`,
        2,
      );
    }
  }

  const original = readFileSync(rampPath, "utf8");

  // Schema-invariant guard: section required by every operating mode.
  if (!/^## Cadence Mutes$/m.test(original)) {
    process.stderr.write(
      `RAMP.md at ${rampPath} is missing the '## Cadence Mutes' section\n`,
    );
    process.stderr.write(
      `(ramp may have been scaffolded under Phase 1; add the section manually)\n`,
    );
    return 1;
  }

  if (mode === "status") return printStatus(ws, original);

  const updated = editMutes(original, category as Category, mode);
  writeFileSync(rampPath, updated);
  return 0;
};

if (import.meta.main) process.exit(main());
