import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Regression tests for validate.fish Phase 1j (stable anchor presence).
//
// Phase 1j asserts each <a id="…"> anchor registered in validate.fish's
// anchor_registry is still present in its canonical home file. This test
// file focuses on the scope-tier-memory-check anchor added by Task 10.
//
// Tests:
//   A) Fixture seeded with real planning.md + sibling rules → Phase 1j passes
//      for scope-tier-memory-check (anchor present in rules/planning.md)
//   B) planning.md with scope-tier-memory-check anchor removed → Phase 1j
//      fails naming the missing anchor and the file
//
// Migrated approach: subprocess-style with CLAUDE_CONFIG_REPO_DIR override,
// matching Phase 1g/1l/1o patterns (ADR #0012, issue #210/211).

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

// Extract only the Phase 1j block — header line through the next blank line.
// Combine stdout + stderr so a failure printed on either stream is captured.
// Sibling-phase failures on the minimal fixture do not affect these tests —
// assertions target only the 1j slice.
const extractPhase1j = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Stable anchor presence"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1j header not found in validate.fish output — phase may have been renamed/removed.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
    );
  }
  const slice: string[] = [];
  for (let i = headerIdx; i < lines.length; i++) {
    slice.push(lines[i]);
    if (i > headerIdx && lines[i] === "") break;
  }
  return slice.join("\n");
};

const fixtures: string[] = [];
const TMP_PREFIX = tmpdir();

// Build a minimal fixture with the rule files Phase 1j needs. Per issue #375
// the former rules/planning.md was split into a three-file floor trio:
//   rules/planning-pipeline.md     — home for trivial-tier-criteria
//   rules/skip-contract.md          — home for skip-contract, emission-contract,
//                                      override-skip-contract, emission-contract-per-gate
//   rules/pressure-framing-floor.md — home for pressure-framing-floor,
//                                      architectural-invariant, emergency-bypass-sentinel,
//                                      fast-track-validation-emission, scope-tier-memory-check
//   rules/execution-mode.md         — home for single-implementer-mode anchor
//   rules/goal-driven.md            — home for verify-checks anchor
//   rules/verification.md           — home for goal-verification anchor
//   rules/GOVERNANCE.md             — home for hard-gate-cap anchor
//
// Seeding all of these prevents Phase 1j from failing on "anchor home missing"
// for sibling entries — keeping the extracted slice clean for assertions.
const makeFixture = (
  pressureFramingFloorOverride?: string,
): string => {
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1j-"));
  for (const sub of ["rules", "skills", "agents", "commands", "adrs"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);

  // Seed the floor trio. pressure-framing-floor.md may be overridden to
  // simulate anchor removal (used by Test B).
  const trioFiles = [
    "planning-pipeline.md",
    "skip-contract.md",
    "pressure-framing-floor.md",
  ];
  for (const name of trioFiles) {
    const content =
      name === "pressure-framing-floor.md" && pressureFramingFloorOverride
        ? pressureFramingFloorOverride
        : readFileSync(join(REPO, "rules", name), "utf8");
    writeFileSync(join(dir, "rules", name), content);
  }

  // Seed sibling anchor homes referenced by Phase 1j registry.
  const siblings = [
    "execution-mode.md",
    "goal-driven.md",
    "verification.md",
    "GOVERNANCE.md",
  ];
  for (const name of siblings) {
    writeFileSync(
      join(dir, "rules", name),
      readFileSync(join(REPO, "rules", name), "utf8"),
    );
  }

  return dir;
};

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    if (!dir.startsWith(TMP_PREFIX)) {
      console.error(`afterEach: refusing to clean non-tmp path ${dir}`);
      continue;
    }
    const restore = spawnSync("chmod", ["-R", "u+rw", dir], {
      encoding: "utf8",
    });
    if (restore.error) {
      console.error(
        `afterEach: chmod spawn failed for ${dir}: ${restore.error.message}`,
      );
    } else if (restore.status !== 0) {
      console.error(
        `afterEach: chmod exited ${restore.status} for ${dir}: ${restore.stderr}`,
      );
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      console.error(
        `afterEach: rmSync failed for ${dir}: ${(e as Error).message}`,
      );
    }
  }
});

describe("validate.fish Phase 1j (stable anchor presence)", () => {
  test(
    "A: real pressure-framing-floor.md with scope-tier-memory-check anchor → Phase 1j passes",
    () => {
      // Seed the real rules/pressure-framing-floor.md — the
      // scope-tier-memory-check anchor moved here from planning.md per
      // issue #375 split and must be present in the real file.
      const fixture = makeFixture();
      const out = extractPhase1j(runValidate(fixture));

      // The scope-tier-memory-check entry must pass
      expect(out).toContain(
        "Scope-tier memory check: anchor #scope-tier-memory-check present in rules/pressure-framing-floor.md",
      );
      // No failures in the extracted slice
      expect(out).not.toContain("✗");
    },
  );

  test(
    "B: pressure-framing-floor.md with scope-tier-memory-check anchor removed → Phase 1j fails",
    () => {
      // Copy real pressure-framing-floor.md but strip the
      // scope-tier-memory-check anchor line.
      const realFloor = readFileSync(
        join(REPO, "rules", "pressure-framing-floor.md"),
        "utf8",
      );
      const stripped = realFloor.replace(
        /<a id="scope-tier-memory-check"><\/a>\n?/g,
        "",
      );
      // Guard: patch must have removed something — if the anchor line changes
      // format, this test fails loudly rather than silently passing on an
      // unchanged file (which would make Test B a false-pass).
      expect(stripped).not.toBe(realFloor);

      const fixture = makeFixture(stripped);
      const out = extractPhase1j(runValidate(fixture));

      // Phase 1j must emit a failure naming the missing anchor and the file
      expect(out).toContain("scope-tier-memory-check");
      expect(out).toContain("pressure-framing-floor.md");
      expect(out).toContain("✗");
      // The fail line names the missing <a id> marker
      expect(out).toMatch(
        /missing.*scope-tier-memory-check.*pressure-framing-floor\.md/,
      );
    },
  );
});
