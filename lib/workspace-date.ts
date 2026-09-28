// Shared date and workspace-name helpers for skill scripts.
//
// Convention: every workspace date (RAMP.md "Started:", risk "last reviewed",
// graduation tags) is a UTC calendar date, YYYY-MM-DD. Mixing local and UTC
// dates shifts day counts by one near midnight, so all writers and readers
// go through this module (and onboard-scaffold.fish uses `date -u`).
//
// Lives at the repo root, not under skills/, because every skills/*/ dir is
// treated as a skill: validate.fish requires a SKILL.md and link-config.fish
// symlinks it into ~/.claude/skills/.

const MS_PER_DAY = 86_400_000;

export const todayIso = (now: Date = new Date()): string =>
  now.toISOString().slice(0, 10);

// Whole calendar days from `fromIso` to `toIso` (negative if `toIso` is
// earlier). Both dates are read as UTC midnight, which has no DST shifts.
// Returns NaN when either date does not parse, so callers can reject it.
export const daysBetween = (fromIso: string, toIso: string): number => {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / MS_PER_DAY);
};

// Org name from a workspace path: the last path segment, without a leading
// "onboard-" (so ~/onboard-acme/ → "acme").
export const orgSlug = (workspacePath: string): string => {
  const base = workspacePath.replace(/\/+$/, "").split("/").pop() ?? "";
  return base.replace(/^onboard-/, "");
};
