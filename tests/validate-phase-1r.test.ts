import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { getuid } from "node:process";
import { join, resolve } from "node:path";

// Regression tests for validate.fish Phase 1r (skill-eval discriminating-signal
// presence, ADR #0019).
//
// Phase 1r closes the silent-failure mode where a skills/<name>/evals/evals.json
// ships with zero `"tier": "required"` assertions: Phase 1m would still pass it
// (JSON shape OK), but the suite carries no spoof-resistant pass criterion at
// the skill's behavioral boundary. ADR #0019 makes the discriminating-signal
// presence a mechanical requirement.
//
// Tests:
//   A) Clean fixture: one skill, one required-tier assertion → passes
//   B) No required-tier anywhere in the suite → hard fail with ADR #0019 cite
//   C) Multiple skills, only one missing required-tier → fail names the right
//      file, other skills still pass (no first-fail masking)
//   D) Zero-state: no skills/*/evals/evals.json files → documented pass, no
//      fail (mirrors Phase 1m's silent-skip-prevention contract — but inverted
//      for the empty case, since Phase 1r is additive over 1m)
//   E) Unreadable evals.json (chmod 000) → grep I/O error surfaces distinctly
//      via status ≥ 2 path; not silently misclassified as "zero required-tier"
//      which would mask the real cause

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

// Capture only the Phase 1r block — header through next blank line. Combine
// stdout+stderr. Sibling-phase failures on the seeded fixture do not fail this
// suite — assertions target Phase 1r only.
const extractPhase1r = (r: RunResult): string => {
  const combined = `${r.stdout}\n${r.stderr}`;
  const lines = combined.split("\n");
  const headerIdx = lines.findIndex((line) =>
    line.includes("── Phase 1r: skill-eval discriminating-signal presence"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `Phase 1r header not found — phase may have been renamed/removed.\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
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

const makeRepoFixture = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "validate-phase-1r-"));
  for (const sub of ["rules", "skills", "agents", "commands", "adrs"]) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  fixtures.push(dir);
  return dir;
};

// Seed a single skill 'archx' with one eval carrying a required-tier assertion.
type Seed = {
  repo: string;
  evalsJson: string;
};

const seedSkillWithRequired = (repo: string, skill: string): Seed => {
  const evalsDir = join(repo, "skills", skill, "evals");
  mkdirSync(evalsDir, { recursive: true });
  const evalsJson = join(evalsDir, "evals.json");
  writeFileSync(
    evalsJson,
    JSON.stringify(
      {
        skill,
        evals: [
          {
            name: "smoke",
            prompt: "/x",
            assertions: [
              {
                type: "regex",
                pattern: "ok",
                tier: "required",
                description: "stub required-tier",
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );
  return { repo, evalsJson };
};

const seedSkillWithoutRequired = (repo: string, skill: string): Seed => {
  const evalsDir = join(repo, "skills", skill, "evals");
  mkdirSync(evalsDir, { recursive: true });
  const evalsJson = join(evalsDir, "evals.json");
  writeFileSync(
    evalsJson,
    JSON.stringify(
      {
        skill,
        evals: [
          {
            name: "regex-only",
            prompt: "/x",
            assertions: [
              {
                type: "regex",
                pattern: "ok",
                description: "no tier field at all",
              },
              {
                type: "regex",
                pattern: "fine",
                tier: "diagnostic",
                description: "diagnostic-tier — does not satisfy ADR #0019",
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );
  return { repo, evalsJson };
};

const TMP_PREFIX = tmpdir();

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    if (!dir.startsWith(TMP_PREFIX)) {
      console.error(`afterEach: refusing to clean non-tmp path ${dir}`);
      continue;
    }
    // Restore perms in case a test chmod 000'd a file inside (Test E).
    const restore = spawnSync("chmod", ["-R", "u+rw", dir], { encoding: "utf8" });
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

describe("validate.fish Phase 1r (skill-eval discriminating-signal presence, ADR #0019)", () => {
  test("A: skill with required-tier assertion → passes", () => {
    const repo = makeRepoFixture();
    seedSkillWithRequired(repo, "archx");
    const out = extractPhase1r(runValidate(repo));
    expect(out).toContain(
      "skills/archx/evals/evals.json: 1 required-tier assertion(s)",
    );
    expect(out).not.toMatch(/✗.*archx/);
  });

  test("B: skill missing required-tier → hard fail with ADR #0019 cite", () => {
    const repo = makeRepoFixture();
    seedSkillWithoutRequired(repo, "archx");
    const out = extractPhase1r(runValidate(repo));
    expect(out).toContain(
      "skills/archx/evals/evals.json: no required-tier assertions found",
    );
    expect(out).toContain("ADR #0019");
    // Must NOT pass — passing line is the regression signature this test
    // exists to prevent.
    expect(out).not.toContain(
      "skills/archx/evals/evals.json: 1 required-tier",
    );
  });

  test("C: mixed — one skill required-tier, one without → only the offender fails", () => {
    const repo = makeRepoFixture();
    seedSkillWithRequired(repo, "good-skill");
    seedSkillWithoutRequired(repo, "bad-skill");
    const out = extractPhase1r(runValidate(repo));
    expect(out).toContain(
      "skills/good-skill/evals/evals.json: 1 required-tier assertion(s)",
    );
    expect(out).toContain(
      "skills/bad-skill/evals/evals.json: no required-tier assertions found",
    );
    // First-fail masking guard: good-skill must still pass even when
    // bad-skill fails. The discovery loop should iterate all files.
    expect(out).not.toMatch(/✗.*good-skill/);
  });

  test("D: zero-state — no skills/*/evals/evals.json → documented pass, no fail", () => {
    const repo = makeRepoFixture();
    // Deliberately no skill eval files seeded.
    const out = extractPhase1r(runValidate(repo));
    expect(out).toContain(
      "no skills/*/evals/evals.json files — Phase 1r has nothing to validate",
    );
    expect(out).not.toMatch(/✗/);
  });

  // chmod 000 does not block reads when running as root; mirror Phase 1n Test J
  // and skip explicitly so bun reports the skip rather than silently passing an
  // assertion that never ran.
  test.skipIf(getuid?.() === 0)(
    "E: unreadable evals.json → grep I/O error surfaces distinctly (not silent zero-required)",
    () => {
      const repo = makeRepoFixture();
      const { evalsJson } = seedSkillWithRequired(repo, "archx");
      chmodSync(evalsJson, 0o000);
      const out = extractPhase1r(runValidate(repo));
      expect(out).toContain("grep returned error status");
      expect(out).toContain("skills/archx/evals/evals.json");
      // Must NOT have silently misclassified as "no required-tier" — that
      // collapse would emit the wrong fail message and obscure the I/O cause.
      expect(out).not.toContain("no required-tier assertions found");
    },
  );
});
