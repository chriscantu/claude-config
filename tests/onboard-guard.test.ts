// tests/onboard-guard.test.ts
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
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
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Priya Patel"]);
    const deck = writeDeck(ws, "# Notes\n\nPriya Patel approved the plan.\n");
    const r = run("attribution-check", deck, map);
    expect(r.exitCode).toBe(3);
  });

  test("captures bullet without role separator (whole-bullet fallback)", () => {
    const ws = makeWorkspace();
    const mapPath = join(ws, "stakeholders", "map.md");
    writeFileSync(
      mapPath,
      "# Stakeholder Map — acme\n\n## Direct reports\n\n- Solo Name\n",
    );
    const deck = writeDeck(ws, "# Notes\n\nSolo Name flagged a risk.\n");
    const r = run("attribution-check", deck, mapPath);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("Solo Name");
  });

  test("matches hyphenated names (Mary-Jane Watson)", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Mary-Jane Watson"]);
    const deck = writeDeck(
      ws,
      "# Notes\n\nMary-Jane Watson flagged the platform risk.\n",
    );
    const r = run("attribution-check", deck, map);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("Mary-Jane Watson");
  });

  test("matches names containing apostrophes (O'Brien)", () => {
    const ws = makeWorkspace();
    const map = writeMap(ws, ["Sean O'Brien"]);
    const deck = writeDeck(ws, "# Notes\n\nSean O'Brien approved.\n");
    const r = run("attribution-check", deck, map);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("O'Brien");
  });
});

describe("bin/onboard-guard.ts misuse", () => {
  test("unknown subcommand exits 64", () => {
    const r = run("nonsense");
    expect(r.exitCode).toBe(64);
    expect(r.stderr).toContain("unknown subcommand");
  });

  test("refuse-raw with no args exits 64", () => {
    const r = run("refuse-raw");
    expect(r.exitCode).toBe(64);
    expect(r.stderr).toContain("usage");
  });

  test("attribution-check with one arg exits 64", () => {
    const r = run("attribution-check", "/tmp/only-one");
    expect(r.exitCode).toBe(64);
    expect(r.stderr).toContain("usage");
  });
});
