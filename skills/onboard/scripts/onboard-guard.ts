#!/usr/bin/env bun
// onboard-guard — confidentiality boundary enforcement for /onboard workspaces.
//
// Subcommands:
//   refuse-raw <path>                Exit 2 if <path> is inside any interviews/raw/ or
//                                    notes/raw/ dir. Both segments are confidential
//                                    sources: interviews/raw/ holds /swot verbatim
//                                    intake; notes/raw/ holds /strategy-doc raw notes
//                                    that must not feed downstream synthesis.
//   attribution-check <deck> <map>   Exit 3 if <deck> markdown contains stakeholder
//                                    names extracted from <map>.

import { readFileSync, realpathSync } from "node:fs";
import { basename, sep } from "node:path";

const RAW_SEGMENTS = [
  `${sep}interviews${sep}raw${sep}`,
  `${sep}notes${sep}raw${sep}`,
] as const;

type RawCheck =
  | { kind: "broken"; input: string }
  | { kind: "inside"; input: string; resolved: string; segment: string }
  | { kind: "outside"; input: string; resolved: string };

export const checkPath = (path: string): RawCheck => {
  let resolved: string;
  try {
    resolved = realpathSync(path);
  } catch {
    return { kind: "broken", input: path };
  }
  const probe = resolved + sep;
  const matchedSegment = RAW_SEGMENTS.find((seg) => probe.includes(seg));
  return matchedSegment
    ? { kind: "inside", input: path, resolved, segment: matchedSegment }
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
    case "inside": {
      const trimmed = check.segment.replace(new RegExp(`^${sep}|${sep}$`, "g"), "");
      const downstreamHint = trimmed === "interviews/raw"
        ? "Downstream skills (/swot, /present) read interviews/sanitized/ exclusively."
        : "Downstream skills (/strategy-doc, /present) read sanitized notes/*.md exclusively (excluding notes/raw/).";
      process.stderr.write(
        `refused: ${check.input} (resolves to ${check.resolved}) is inside ${trimmed}/\n` +
        `${downstreamHint}\n` +
        `See skills/onboard/refusal-contract.md.\n`,
      );
      return 2;
    }
    case "outside":
      return 0;
  }
};

// Extract names from map.md bullet leaders. A bullet line is `- <name> — <role>`
// (em-dash, hyphen, or colon as separator). Falls back to the whole bullet text
// if no separator is present.
export const extractNames = (mapMarkdown: string): string[] => {
  const names = new Set<string>();
  for (const line of mapMarkdown.split("\n")) {
    const match = line.match(/^-\s+(.+?)(?:\s+[—\-:]\s+|$)/);
    if (!match) continue;
    const candidate = match[1]!.trim();
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
    const lineMatches = lines[i]!.matchAll(pattern);
    for (const m of lineMatches) {
      matches.push({
        file: basename(deckPath),
        line: i + 1,
        name: m[0],
        context: lines[i]!.trim(),
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

const main = (): number => {
  const [sub, ...args] = process.argv.slice(2);
  switch (sub) {
    case "refuse-raw":
      if (args.length !== 1) {
        process.stderr.write("usage: onboard-guard refuse-raw <path>\n");
        return 64;
      }
      return refuseRaw(args[0]!);
    case "attribution-check":
      if (args.length !== 2) {
        process.stderr.write(
          "usage: onboard-guard attribution-check <deck.md> <map.md>\n",
        );
        return 64;
      }
      return attributionCheck(args[0]!, args[1]!);
    default:
      process.stderr.write(`unknown subcommand: ${sub ?? "(none)"}\n`);
      return 64;
  }
};

if (import.meta.main) process.exit(main());
