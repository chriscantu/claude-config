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
  // Match the segment anywhere in the absolute path. Trailing sep ensures we
  // do NOT match a file literally named "raw" outside the interviews dir.
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
      return refuseRaw(args[0]!);
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
