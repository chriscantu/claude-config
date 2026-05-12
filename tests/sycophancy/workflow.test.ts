/**
 * Structural test for .github/workflows/sycophancy-regression.yml.
 *
 * The YAML's branching logic (event guards, baseline aggregation, compare
 * step, PR comment, threshold env wiring) is unverifiable without a live
 * CI run. This test catches the most common regression class — accidental
 * step deletion or env-wiring drift — by parsing the YAML and asserting
 * the load-bearing wiring still exists. Issue: #312 review item 5.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}
interface Workflow {
  on: { pull_request?: unknown; push?: unknown };
  permissions: Record<string, string>;
  jobs: Record<string, { steps: WorkflowStep[] }>;
}

const WORKFLOW_PATH = join(import.meta.dir, "..", "..", ".github", "workflows", "sycophancy-regression.yml");

function load(): Workflow {
  return parse(readFileSync(WORKFLOW_PATH, "utf8")) as Workflow;
}

describe("sycophancy-regression.yml structural integrity", () => {
  test("parses as valid YAML", () => {
    expect(() => load()).not.toThrow();
  });

  test("triggers on pull_request and push", () => {
    const wf = load();
    expect(wf.on.pull_request).toBeDefined();
    expect(wf.on.push).toBeDefined();
  });

  test("grants pull-requests:write so PR-comment step can post", () => {
    const wf = load();
    expect(wf.permissions["pull-requests"]).toBe("write");
  });

  test("checks out with fetch-depth: 0 (needed to worktree origin/main)", () => {
    const wf = load();
    const checkout = wf.jobs.classify.steps.find((s) => s.uses?.startsWith("actions/checkout"));
    expect(checkout).toBeDefined();
    expect(checkout!.with!["fetch-depth"]).toBe(0);
  });

  test("worktrees origin/main and aggregates the baseline (gates Δ math)", () => {
    const wf = load();
    const baseline = wf.jobs.classify.steps.find((s) => s.name?.includes("main (baseline)"));
    expect(baseline).toBeDefined();
    expect(baseline!.if).toContain("pull_request");
    expect(baseline!.run).toContain("git worktree add");
    expect(baseline!.run).toContain("origin/main");
    expect(baseline!.run).toContain("historical-main.json");
  });

  test("compare step wires the threshold env from repo variable", () => {
    const wf = load();
    const compare = wf.jobs.classify.steps.find((s) => s.name?.startsWith("Compare PR vs main"));
    expect(compare).toBeDefined();
    expect(compare!.env!.THRESHOLD_PP).toContain("SYCO_HEDGE_DELTA_THRESHOLD_PP");
    expect(compare!.env!.THRESHOLD_PP).toContain("'5'"); // default fallback
    expect(compare!.run).toContain("compare-historical.ts");
    expect(compare!.run).toContain("$GITHUB_STEP_SUMMARY");
  });

  test("PR-comment step uses github-script + always() so regressions still surface", () => {
    const wf = load();
    const comment = wf.jobs.classify.steps.find((s) => s.name?.includes("comment"));
    expect(comment).toBeDefined();
    expect(comment!.uses).toContain("actions/github-script");
    expect(comment!.if).toContain("always()");
    expect(comment!.if).toContain("pull_request");
  });

  test("ablate step resolves run dir from parent (no hardcoded calibration-<ISO>)", () => {
    const wf = load();
    const ablate = wf.jobs.classify.steps.find((s) => s.name?.startsWith("Run rule-ablation"));
    expect(ablate).toBeDefined();
    // The hardcoded path the original workflow had — must not reappear.
    expect(ablate!.run).not.toContain("calibration-2026-05-11T23-23-18Z");
    expect(ablate!.run).toContain("tests/sycophancy/results/full");
  });
});
