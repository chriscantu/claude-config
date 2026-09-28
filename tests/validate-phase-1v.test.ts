import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { runPhase, useFixtures } from "./validate-harness";

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

const makeRepoFixture = useFixtures("validate-phase-1v-", ["rules", "skills", "agents", "commands", "adrs", "hooks", "bin", "tests"]);

const seedRule = (repo: string, basename: string, body: string): string => {
  const path = join(repo, "rules", basename);
  const fm = `---\ndescription: stub for Phase 1v fixture\n---\n\n`;
  writeFileSync(path, fm + body);
  return path;
};

const writeSnapshot = (repo: string, entries: string[]): void => {
  writeFileSync(join(repo, "tests", "anchor-snapshots.txt"), entries.join("\n") + "\n");
};

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
    const out = runPhase(repo, "1v").block;
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
    const result = runPhase(repo, "1v");
    const out = result.block;
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
    const result = runPhase(repo, "1v");
    const out = result.block;
    expect(out).toMatch(/✗.*ghost.*not found/);
    expect(result.exitCode).toBe(1);
  });

  test("D: snapshot file missing → loud fail", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "sample.md", SAMPLE_BODY);
    const result = runPhase(repo, "1v");
    const out = result.block;
    expect(out).toMatch(/✗.*Phase 1v.*tests\/anchor-snapshots\.txt.*missing/);
  });

  test("E: anchor on disk but not in snapshot → warn (forward-add allowed)", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "sample.md", SAMPLE_BODY);
    const fileContent = `---\ndescription: stub for Phase 1v fixture\n---\n\n${SAMPLE_BODY}`;
    const alphaHash = computeBodyHash(fileContent, "alpha");
    writeSnapshot(repo, [`alpha|sample.md|${alphaHash}`]);
    const out = runPhase(repo, "1v").block;
    expect(out).toMatch(/⚠.*beta.*not in snapshot/);
    // Phase 1v itself emits no ✗ for forward-adds — checked on the phase
    // block, not the exit code.
    expect(out).not.toMatch(/✗.*beta/);
  });

  test("F: empty snapshot file → loud fail", () => {
    const repo = makeRepoFixture();
    seedRule(repo, "sample.md", SAMPLE_BODY);
    writeSnapshot(repo, []);
    const result = runPhase(repo, "1v");
    const out = result.block;
    expect(out).toMatch(/✗.*Phase 1v.*empty/);
  });
});
