#!/usr/bin/env bun
// onboard-calendar — Phase 4 paste-only calendar-watch helper.
//
// Subcommands:
//   parse <path | ->                     stdin or file → JSON event list
//   diff <events.json> <map.md>          unmatched invitees → JSON
//   paste <workspace>                    end-to-end: stdin → suggestions.md + stamp + NAGS append

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
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
