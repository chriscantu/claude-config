/**
 * Tests for compare-historical.ts — PR-vs-main delta, threshold gate,
 * Wilson CI overlap detection, summary rendering. Issue #312.
 */

import { describe, expect, test } from "bun:test";
import { compare, parseArgs, renderSummary } from "./compare-historical";
import type { Report } from "./aggregate-historical";

function mkReport(rate: number, ci: [number, number], n: number): Report {
  return {
    generated_at: "2026-05-12T00:00:00.000Z",
    source: "test",
    n_triples: n,
    shape_distribution: [],
    headline_hedge_then_comply_rate: rate,
    headline_hedge_then_comply_wilson_95: ci,
    bucket_breakdown: [],
    notes: [],
  };
}

describe("compare", () => {
  test("computes Δ in percentage points (PR − base)", () => {
    const pr = mkReport(0.5, [0.4, 0.6], 50);
    const base = mkReport(0.1, [0.05, 0.18], 50);
    const c = compare(pr, base, 5);
    expect(c.delta_pp).toBeCloseTo(40);
  });

  test("regressed when Δ ≥ threshold pp", () => {
    const pr = mkReport(0.5, [0.4, 0.6], 50);
    const base = mkReport(0.44, [0.3, 0.58], 50);
    expect(compare(pr, base, 5).regressed).toBe(true);
    expect(compare(pr, base, 10).regressed).toBe(false);
  });

  test("Δ exactly equal to threshold counts as regression (≥, not >)", () => {
    const pr = mkReport(0.15, [0.08, 0.25], 50);
    const base = mkReport(0.1, [0.05, 0.18], 50);
    const c = compare(pr, base, 5);
    expect(c.delta_pp).toBeCloseTo(5);
    expect(c.regressed).toBe(true);
  });

  test("negative Δ (improvement) never regresses", () => {
    const pr = mkReport(0.02, [0.005, 0.07], 50);
    const base = mkReport(0.44, [0.3, 0.58], 50);
    const c = compare(pr, base, 5);
    expect(c.delta_pp).toBeLessThan(0);
    expect(c.regressed).toBe(false);
  });

  test("ci_overlap=false when intervals are disjoint", () => {
    const pr = mkReport(0.8, [0.7, 0.9], 50);
    const base = mkReport(0.1, [0.05, 0.18], 50);
    expect(compare(pr, base, 5).ci_overlap).toBe(false);
  });

  test("ci_overlap=true when intervals share any point", () => {
    const pr = mkReport(0.15, [0.08, 0.25], 50);
    const base = mkReport(0.1, [0.05, 0.18], 50);
    expect(compare(pr, base, 5).ci_overlap).toBe(true);
  });

  test("ci_overlap=true on shared endpoint (boundary)", () => {
    const pr = mkReport(0.2, [0.18, 0.3], 50);
    const base = mkReport(0.1, [0.05, 0.18], 50);
    expect(compare(pr, base, 5).ci_overlap).toBe(true);
  });
});

describe("renderSummary", () => {
  test("regression verdict mentions threshold", () => {
    const c = compare(mkReport(0.5, [0.4, 0.6], 50), mkReport(0.1, [0.05, 0.18], 50), 5);
    const md = renderSummary(c);
    expect(md).toContain("REGRESSION");
    expect(md).toContain("5pp");
    expect(md).toContain("+40.0pp");
  });

  test("no-regression verdict on improvement", () => {
    const c = compare(mkReport(0.02, [0.005, 0.07], 50), mkReport(0.44, [0.3, 0.58], 50), 5);
    const md = renderSummary(c);
    expect(md).toContain("no regression");
    expect(md).not.toContain("REGRESSION");
  });
});

describe("parseArgs", () => {
  test("requires --pr and --base", () => {
    expect(() => parseArgs(["--pr", "a.json"])).toThrow("--base");
    expect(() => parseArgs(["--base", "b.json"])).toThrow("--pr");
  });

  test("defaults threshold to 5pp", () => {
    expect(parseArgs(["--pr", "a.json", "--base", "b.json"]).thresholdPp).toBe(5);
  });

  test("rejects negative or non-finite threshold", () => {
    expect(() => parseArgs(["--pr", "a", "--base", "b", "--threshold-pp", "-1"])).toThrow();
    expect(() => parseArgs(["--pr", "a", "--base", "b", "--threshold-pp", "NaN"])).toThrow();
  });

  test("accepts --threshold-pp and --summary-out", () => {
    const a = parseArgs(["--pr", "a.json", "--base", "b.json", "--threshold-pp", "10", "--summary-out", "s.md"]);
    expect(a.thresholdPp).toBe(10);
    expect(a.summaryOut).toBe("s.md");
  });
});
