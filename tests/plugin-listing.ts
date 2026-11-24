// Sizes each plugin's share of the skill or agent listing that rides on every request.

/** Plugin name → the newest listing that named it and how many characters its entries took there. */
export type NewestListing = Map<string, { ts: string; chars: number }>;

// Plugin entries read "- <plugin>:<name>: <description>"; the first segment is the plugin.
const LISTING_ENTRY = /^- ([a-z0-9-]+):/;

/**
 * Records one listing, keeping for each plugin the newest listing that still
 * names it. A plugin turned off since then drops out of later listings, so
 * this keeps the size it had while on: the saving turning it off gave.
 */
export function recordListing(newest: NewestListing, ts: string, lines: string[]) {
  const charsByPlugin = new Map<string, number>();
  for (const line of lines) {
    const m = LISTING_ENTRY.exec(line);
    if (m) charsByPlugin.set(m[1]!, (charsByPlugin.get(m[1]!) ?? 0) + line.length);
  }
  for (const [plugin, chars] of charsByPlugin) {
    const prev = newest.get(plugin);
    if (!prev || ts >= prev.ts) newest.set(plugin, { ts, chars });
  }
}
