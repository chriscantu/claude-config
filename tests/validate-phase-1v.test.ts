import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

// Regression tests for validate.fish Phase 1v (anchor-content snapshot, #444).
//
// Phase 1j confirms an anchor `<a id="X"></a>` is present in its canonical
// file. Phase 1v extends that — for each registered anchor it hashes the
// section body and compares against a committed snapshot at
// tests/anchor-snapshots.txt. CI fails when a body changes without a
// corresponding snapshot update, forcing conscious intent on prose drift
// behind a stable anchor.
//
// Section body = lines after `<a id="X"></a>`, skipping leading blank lines,
// then the section's own heading (h2/h3/etc.) included unconditionally, then
// content until the next anchor or next h2.
//
// Tests:
//   A) Snapshot matches body → passes
//   B) Body modified, snapshot stale → hard fail with anchor cite
//   C) Anchor missing on disk but in snapshot → fail (Phase 1j handles
//      anchor presence too, but Phase 1v surfaces the snapshot drift)
//   D) Snapshot file missing → loud fail
//   E) New anchor on disk not in snapshot → warn (forward-add OK; snapshot
//      should be regenerated, but missing-from-snapshot is not a HARD-FAIL)
//   F) Empty snapshot file → loud fail (no anchors to validate)

const REPO = resolve(import.meta.dir, "..");
const VALIDATE = join(REPO, "validate.fish");

type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const runValidate = (fixture: string): RunResult => {
  const result = spawnSync("fish", [VALIDATE], {
    env: { ...process.env, CLAUDE_CONFIG_REPO_DIR: fixture },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const extractPhase1v = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Phase 1v: anchor-content snapshot"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1v header not found.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
    );
  }
  const slice: string[] = [];
  for (let i = headerIdx; i < lines.length; i++) {
    slice.push(lines[i]);
    if (i > headerIdx && lines[i] === "") break;
  }
  return slice.join("\n");
};

// Compute hash the same way Phase 1v does so the test produces matching
// snapshots without coupling to the fish-script extractor.
// Body = lines after the anchor, skip leading blanks, include first non-blank
// (the section's heading), then continue until next `<a id=` or `^## `.
// Normalize: strip trailing whitespace per line, drop trailing blank lines,
// terminate with single newline before hashing.
const computeBodyHash = (fileContent: string, anchorId: string): string => {
  const lines = fileContent.split("\n");
  const anchorLine = `<a id="${anchorId}"></a>`;
  const startIdx = lines.findIndex((l) => l.includes(anchorLine));
  if (startIdx < 0) return "";
  const body: string[] = [];
  let seenFirst = false;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!seenFirst) {
      if (line === "") continue;
      seenFirst = true;
      body.push(line);
      continue;
    }
    if (line.startsWith("<a id=")) break;
    if (line.startsWith("## ")) break;
    body.push(line);
  }
  // Strip trailing whitespace per line; drop trailing blank lines.
  const normalized = body.map((l) => l.replace(/[ \t]+$/, ""));
  while (normalized.length > 0 && normalized[normalized.length - 1] === "") {
    normalized.pop();
  }
  return createHash("sha256")
    .update(normalized.join("\n") + "\n")
    .digest("hex");
};

const fixtures: string[] = [];

const makeRepoFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1v-"));
  for (const sub of ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);
  return dir;
};

const seedRule = (repo: string, basename: string, body: string): string => {
  const path = join(repo, "rules", basename);
  const fm = `---\ndescription: stub for Phase 1v fixture\n---\n\n`;
  writeFileSync(path, fm + body);
  return path;
};

const writeSnapshot = (repo: string, entries: string[]): void => {
  writeFileSync(join(repo, "tests", "anchor-snapshots.txt"), entries.join("\n") + "\n");
};

const TMP_PREFIX = tmpdir();

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    if (!dir.startsWith(TMP_PREFIX)) continue;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.error(`afterEach: rmSync failed: ${(e as Error).message}`);
    }
  }
});

const SAMPLE_BODY = `<a id="alpha"></a>

### Alpha section

Body text for alpha.

Multi-paragraph.

<a id="beta"></a>

### Beta section

Body text for beta.
`;

describe("validate.fish Phase 1v (anchor-content snapshot, #444)", () => {
  test("A: snapshot matches body → passes", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "sample.md", SAMPLE_BODY);
    const fileContent = `---\ndescription: stub for Phase 1v fixture\n---\n\n${SAMPLE_BODY}`;
    const alphaHash = computeBodyHash(fileContent, "alpha");
    const betaHash = computeBodyHash(fileContent, "beta");
    writeSnapshot(repo, [
      `alpha|sample.md|${alphaHash}`,
      `beta|sample.md|${betaHash}`,
    ]);
    const out = extractPhase1v(runValidate(repo));
    expect(out).toMatch(/✓.*alpha.*matches snapshot/);
    expect(out).toMatch(/✓.*beta.*matches snapshot/);
    expect(out).not.toMatch(/✗.*alpha/);
  });

  test("B: body modified, snapshot stale → hard fail with anchor + file cite", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "sample.md", SAMPLE_BODY);
    writeSnapshot(repo, [
      "alpha|sample.md|0000000000000000000000000000000000000000000000000000000000000000",
    ]);
    const result = runValidate(repo);
    const out = extractPhase1v(result);
    expect(out).toMatch(/✗.*alpha.*sample\.md.*hash mismatch/);
    expect(out).toMatch(/regenerate/);
    expect(result.exitCode).toBe(1);
  });

  test("C: snapshot references missing anchor → hard fail", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "sample.md", SAMPLE_BODY);
    writeSnapshot(repo, [
      "ghost|sample.md|abcdef0000000000000000000000000000000000000000000000000000000000",
    ]);
    const result = runValidate(repo);
    const out = extractPhase1v(result);
    expect(out).toMatch(/✗.*ghost.*not found/);
    expect(result.exitCode).toBe(1);
  });

  test("D: snapshot file missing → loud fail", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "sample.md", SAMPLE_BODY);
    const result = runValidate(repo);
    const out = extractPhase1v(result);
    expect(out).toMatch(/✗.*Phase 1v.*tests\/anchor-snapshots\.txt.*missing/);
  });

  test("E: anchor on disk but not in snapshot → warn (forward-add allowed)", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "sample.md", SAMPLE_BODY);
    const fileContent = `---\ndescription: stub for Phase 1v fixture\n---\n\n${SAMPLE_BODY}`;
    const alphaHash = computeBodyHash(fileContent, "alpha");
    writeSnapshot(repo, [`alpha|sample.md|${alphaHash}`]);
    const out = extractPhase1v(runValidate(repo));
    expect(out).toMatch(/⚠.*beta.*not in snapshot/);
    // Phase 1v itself emits no ✗ for forward-adds — exit code is dominated by
    // unrelated phases in this fixture so checked locally instead of globally.
    expect(out).not.toMatch(/✗.*beta/);
  });

  test("F: empty snapshot file → loud fail", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "sample.md", SAMPLE_BODY);
    writeSnapshot(repo, []);
    const result = runValidate(repo);
    const out = extractPhase1v(result);
    expect(out).toMatch(/✗.*Phase 1v.*empty/);
  });
});
