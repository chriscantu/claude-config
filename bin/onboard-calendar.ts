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
// Email-local charclass excludes whitespace, angle brackets, and em-dash —
// but PERMITS hyphen, since legitimate addresses like `first-last@acme.com`
// must round-trip through the separator branch. The separator regex
// `\s*[—\-]\s*` requires whitespace flanking, so a hyphen inside a local
// part (no surrounding whitespace) is not eligible to be re-interpreted as
// a separator on backtrack — non-ambiguous.
const FREEFORM_NAME_EMAIL = /^(.+?)\s*[—\-]\s*([^\s<>—]+@[^\s<>]+)\s*$/;

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

export const diffEvents = (events: Event[], mapMarkdown: string): Event[] => {
  const known = new Set(extractNames(mapMarkdown).map((n) => n.toLowerCase()));
  return events.filter((e) => !known.has(e.name.toLowerCase()));
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const cmdDiff = (eventsPathOrDash: string, mapPath: string): number => {
  const eventsJson = readInput(eventsPathOrDash);
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
    default:
      process.stderr.write(`unknown subcommand: ${sub ?? "(none)"}\n`);
      return 64;
  }
};

if (import.meta.main) process.exit(main());
