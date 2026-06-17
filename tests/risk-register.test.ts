import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");
const SCRIPT = join(REPO, "skills/risk-register/scripts/risk-register.ts");

const run = (args: string[]) => {
  const r = spawnSync("bun", ["run", SCRIPT, ...args], { encoding: "utf8" });
  return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
};

const mkWs = (): string => mkdtempSync(join(tmpdir(), "rr-"));
const regOf = (ws: string): string => readFileSync(join(ws, "risks", "register.md"), "utf8");

let wsDirs: string[] = [];
const freshWs = (): string => { const w = mkWs(); wsDirs.push(w); return w; };
afterEach(() => { for (const w of wsDirs) rmSync(w, { recursive: true, force: true }); wsDirs = []; });

const seed = (ws: string): void => {
  run(["add", ws, "--desc", "seed risk", "--today", "2026-05-01"]);
};

describe("add", () => {
  test("one-liner add applies all defaults and writes a block", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--desc", "API auth not rotated", "--today", "2026-06-16"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Added R-1 (med/med, owner TBD)");
    const text = regOf(ws);
    expect(text).toContain("### R-1: API auth not rotated   <!-- risk:active -->");
    expect(text).toContain("**Likelihood**: med  **Impact**: med");
    expect(text).toContain("**Owner**: TBD");
    expect(text).toContain("**Last reviewed**: 2026-06-16");
  });

  test("creates risks/ dir and register.md when missing", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "first risk", "--today", "2026-06-16"]);
    expect(existsSync(join(ws, "risks", "register.md"))).toBe(true);
  });

  test("second add increments the ID", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "one", "--today", "2026-06-16"]);
    run(["add", ws, "--desc", "two", "--today", "2026-06-16"]);
    const text = regOf(ws);
    expect(text).toContain("### R-1: one");
    expect(text).toContain("### R-2: two");
  });

  test("non-default values are stored and echoed", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--desc", "billing", "--likelihood", "high", "--impact", "high", "--owner", "Dana", "--today", "2026-06-16"]);
    expect(r.out).toContain("Added R-1 (high/high, owner Dana)");
    expect(regOf(ws)).toContain("**Likelihood**: high  **Impact**: high");
  });

  test("missing --desc exits nonzero", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--today", "2026-06-16"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("--desc");
  });
});

describe("mutators", () => {
  test("ack bumps last-reviewed without changing status", () => {
    const ws = freshWs(); seed(ws);
    const r = run(["ack", ws, "R-1", "--today", "2026-06-16"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("R-1 acked.");
    const text = regOf(ws);
    expect(text).toContain("<!-- risk:active -->");
    expect(text).toContain("**Last reviewed**: 2026-06-16");
  });

  test("escalate flips sentinel and bumps date", () => {
    const ws = freshWs(); seed(ws);
    const r = run(["escalate", ws, "R-1", "--today", "2026-06-16"]);
    expect(r.out).toContain("R-1 escalated.");
    const text = regOf(ws);
    expect(text).toContain("<!-- risk:escalated -->");
    expect(text).toContain("**Last reviewed**: 2026-06-16");
  });

  test("resolve flips sentinel to resolved", () => {
    const ws = freshWs(); seed(ws);
    const r = run(["resolve", ws, "R-1", "--today", "2026-06-16"]);
    expect(r.out).toContain("R-1 resolved.");
    expect(regOf(ws)).toContain("<!-- risk:resolved -->");
  });

  test("escalate bad ID exits nonzero with list hint, file unchanged", () => {
    const ws = freshWs(); seed(ws);
    const before = regOf(ws);
    const r = run(["escalate", ws, "R-99", "--today", "2026-06-16"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("not found");
    expect(r.err).toContain("list");
    expect(r.err).toContain("R-1"); // highest existing
    expect(regOf(ws)).toBe(before);
  });

  test("escalate on missing register exits nonzero", () => {
    const ws = freshWs();
    const r = run(["escalate", ws, "R-1"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("no register");
  });
});

describe("list", () => {
  test("empty register prints No risks tracked", () => {
    const ws = freshWs();
    const r = run(["list", ws]);
    expect(r.out).toContain("No risks tracked.");
  });

  test("list includes resolved entries with R-N IDs", () => {
    const ws = freshWs(); seed(ws);
    run(["resolve", ws, "R-1", "--today", "2026-06-16"]);
    const r = run(["list", ws]);
    expect(r.out).toContain("R-1");
    expect(r.out).toContain("resolved");
  });
});

describe("review", () => {
  const build = (ws: string): void => {
    // R-1 fresh high/high active; R-2 stale med/high; R-3 escalated; R-4 resolved; R-5 fresh low/low
    run(["add", ws, "--desc", "fresh hh", "--likelihood", "high", "--impact", "high", "--today", "2026-06-15"]);
    run(["add", ws, "--desc", "stale mh", "--likelihood", "med", "--impact", "high", "--today", "2026-05-01"]);
    run(["add", ws, "--desc", "to escalate", "--likelihood", "high", "--impact", "high", "--today", "2026-06-15"]);
    run(["escalate", ws, "R-3", "--today", "2026-06-15"]);
    run(["add", ws, "--desc", "to resolve", "--today", "2026-06-15"]);
    run(["resolve", ws, "R-4", "--today", "2026-06-15"]);
    run(["add", ws, "--desc", "fresh ll", "--likelihood", "low", "--impact", "low", "--today", "2026-06-15"]);
  };

  test("header counts: active(stale) · escalated · resolved", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16", "--stale-days", "14"]);
    expect(r.out).toContain("3 active (1 stale) · 1 escalated · 1 resolved");
  });

  test("resolved excluded from all sections", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).not.toContain("to resolve");
  });

  test("stale section shows age annotation; escalated section present", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("ESCALATED (1)");
    expect(r.out).toContain("NEEDS REVIEW — stale >14d (1)");
    expect(r.out).toMatch(/\(\d+ days\)/);
  });

  test("two-letter severity tag rendered; no numeric sum", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("[HH]");
    expect(r.out).not.toMatch(/\bsum\b/i);
  });

  test("top active surfaces fresh high-severity risk", () => {
    const ws = freshWs(); build(ws);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("TOP ACTIVE");
    expect(r.out).toContain("fresh hh");
  });

  test("empty register prints No risks tracked", () => {
    const ws = freshWs();
    expect(run(["review", ws]).out).toContain("No risks tracked.");
  });

  test("all-fresh-no-escalated still lists top active", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "only one", "--today", "2026-06-16"]);
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("TOP ACTIVE (1 of 1)");
  });
});

describe("cli surface", () => {
  test("--help lists six actions, reads no register", () => {
    const r = run(["--help"]);
    expect(r.out).toContain("add");
    expect(r.out).toContain("review");
    expect(r.out).toContain("ack");
    expect(r.out).toContain("escalate");
    expect(r.out).toContain("resolve");
    expect(r.out).toContain("list");
  });

  test("no args prints help", () => {
    const r = run([]);
    expect(r.out).toContain("Usage:");
  });

  test("--stale-days override changes stale cutoff", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "five days old", "--today", "2026-06-11"]);
    const tight = run(["review", ws, "--today", "2026-06-16", "--stale-days", "3"]);
    expect(tight.out).toContain("NEEDS REVIEW");
    const loose = run(["review", ws, "--today", "2026-06-16", "--stale-days", "30"]);
    expect(loose.out).not.toContain("NEEDS REVIEW");
  });

  test("workspace not found gives example-path hint", () => {
    const r = run(["review", "/no/such/ws/here"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("workspace not found");
    expect(r.err).toContain("~/ramps/acme");
  });

  test("malformed register (no id) names a fix path with the expected shape", () => {
    const ws = freshWs();
    mkdirSync(join(ws, "risks"), { recursive: true });
    writeFileSync(join(ws, "risks", "register.md"), "# Risk Register — x\n<!-- risk-register:auto -->\n\n### garbage line with no id\n");
    const r = run(["list", ws]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("malformed");
    expect(r.err).toContain("R-N"); // discriminator: the no-id (Step 1) path, not the no-sentinel (Step 2) path
    expect(r.err).toContain("restore from git");
  });

  test("valid id line with no trailing sentinel hits the Step-2 die (distinct message)", () => {
    const ws = freshWs();
    mkdirSync(join(ws, "risks"), { recursive: true });
    writeFileSync(join(ws, "risks", "register.md"),
      "# Risk Register — acme\n<!-- risk-register:auto -->\n\n### R-1: desc with no sentinel\n- **Likelihood**: med  **Impact**: med\n- **Owner**: TBD\n- **Mitigation**: TBD\n- **Last reviewed**: 2026-06-01\n");
    const r = run(["list", ws]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("missing trailing"); // discriminates Step 2 from Step 1
  });

  test("unknown action exits nonzero", () => {
    const ws = freshWs();
    const r = run(["frobnicate", ws]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("unknown action");
  });
});

describe("robustness (review-driven)", () => {
  test("mutation preserves content before the sentinel", () => {
    const ws = freshWs();
    mkdirSync(join(ws, "risks"), { recursive: true });
    writeFileSync(join(ws, "risks", "register.md"),
      "# Risk Register — acme\nOwned by platform team. Do not hand-edit blocks.\n<!-- risk-register:auto -->\n\n### R-1: thing   <!-- risk:active -->\n- **Likelihood**: med  **Impact**: med\n- **Owner**: TBD\n- **Mitigation**: TBD\n- **Last reviewed**: 2026-05-01\n");
    run(["ack", ws, "R-1", "--today", "2026-06-16"]);
    const text = regOf(ws);
    expect(text).toContain("Owned by platform team. Do not hand-edit blocks.");
    expect(text).toContain("**Last reviewed**: 2026-06-16");
  });

  test("desc containing a sentinel round-trips without hijacking status", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "fake <!-- risk:resolved --> tail", "--today", "2026-06-16"]);
    expect(regOf(ws)).toContain("<!-- risk:active -->");
    const r = run(["list", ws]);
    expect(r.out).toContain("tail");
    expect(r.out).toContain("(active)");
  });

  test("--stale-days non-numeric exits nonzero", () => {
    const ws = freshWs(); seed(ws);
    const r = run(["review", ws, "--stale-days", "abc", "--today", "2026-06-16"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("stale-days");
  });

  test("--stale-days negative exits nonzero", () => {
    const ws = freshWs(); seed(ws);
    const r = run(["review", ws, "--stale-days", "-5", "--today", "2026-06-16"]);
    expect(r.code).not.toBe(0);
  });

  test("unparseable last-reviewed date surfaces as stale, not fresh", () => {
    const ws = freshWs();
    mkdirSync(join(ws, "risks"), { recursive: true });
    writeFileSync(join(ws, "risks", "register.md"),
      "# Risk Register — acme\n<!-- risk-register:auto -->\n\n### R-1: bad date   <!-- risk:active -->\n- **Likelihood**: high  **Impact**: high\n- **Owner**: TBD\n- **Mitigation**: TBD\n- **Last reviewed**: someday\n");
    const r = run(["review", ws, "--today", "2026-06-16"]);
    expect(r.out).toContain("NEEDS REVIEW");
  });

  test("workspace that is a file exits nonzero with actionable error", () => {
    const base = freshWs();
    const f = join(base, "afile");
    writeFileSync(f, "x");
    const r = run(["review", f]);
    expect(r.code).not.toBe(0);
    expect(r.err.toLowerCase()).toMatch(/director/);
  });

  test("newline in --desc is rejected (no entry forgery)", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--desc", "line1\n### R-9: forged   <!-- risk:resolved -->", "--today", "2026-06-16"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("single-line");
  });

  test("malformed header with long trailing whitespace fails fast, no ReDoS", () => {
    const ws = freshWs();
    mkdirSync(join(ws, "risks"), { recursive: true });
    const spaces = " ".repeat(6000); // would hang for seconds under catastrophic backtracking
    writeFileSync(join(ws, "risks", "register.md"),
      `# Risk Register — acme\n<!-- risk-register:auto -->\n\n### R-1: desc${spaces}\n`);
    const r = run(["list", ws]); // must return well within the default test timeout
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("missing trailing");
  });
});

describe("ordering & thresholds", () => {
  test("severity tie-break: equal sum, higher impact ranks first", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "lowhigh", "--likelihood", "low", "--impact", "high", "--today", "2026-06-16"]);
    run(["add", ws, "--desc", "medmed", "--likelihood", "med", "--impact", "med", "--today", "2026-06-16"]);
    run(["add", ws, "--desc", "highlow", "--likelihood", "high", "--impact", "low", "--today", "2026-06-16"]);
    const out = run(["review", ws, "--today", "2026-06-16"]).out;
    // all sum=4; impact ranks 3 > 2 > 1
    expect(out.indexOf("lowhigh")).toBeLessThan(out.indexOf("medmed"));
    expect(out.indexOf("medmed")).toBeLessThan(out.indexOf("highlow"));
  });

  test("--stale-days boundary: exactly N not stale, N-1 stale", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "boundary", "--today", "2026-06-02"]); // 14 days before 2026-06-16
    const at14 = run(["review", ws, "--today", "2026-06-16", "--stale-days", "14"]);
    expect(at14.out).not.toContain("NEEDS REVIEW");
    const at13 = run(["review", ws, "--today", "2026-06-16", "--stale-days", "13"]);
    expect(at13.out).toContain("NEEDS REVIEW");
  });

  test("escalated risk past threshold shows stale annotation inside ESCALATED", () => {
    const ws = freshWs();
    run(["add", ws, "--desc", "old esc", "--likelihood", "high", "--impact", "high", "--today", "2026-05-01"]);
    run(["escalate", ws, "R-1", "--today", "2026-05-01"]);
    const out = run(["review", ws, "--today", "2026-06-16"]).out;
    expect(out).toContain("ESCALATED (1)");
    expect(out.slice(out.indexOf("ESCALATED"))).toMatch(/last seen 2026-05-01\s+\(\d+ days\)/);
  });
});

describe("arg validation (exit codes)", () => {
  test("bad --likelihood rejected with allowed values, exit 2", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--desc", "x", "--likelihood", "frobnicate", "--today", "2026-06-16"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("low|med|high");
  });

  test("bad --today format rejected, exit 2", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--desc", "x", "--today", "06/16/2026"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("YYYY-MM-DD");
  });

  test("bad R-N id format rejected, exit 2", () => {
    const ws = freshWs(); seed(ws);
    const r = run(["ack", ws, "Rxyz", "--today", "2026-06-16"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("R-N");
  });

  test("unknown flag rejected, exit 2", () => {
    const ws = freshWs();
    const r = run(["add", ws, "--desc", "x", "--bogus", "--today", "2026-06-16"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("unknown flag");
  });

  test("orgFromWs strips onboard- prefix in the register title", () => {
    const base = freshWs();
    const ws = join(base, "onboard-acme");
    mkdirSync(ws, { recursive: true });
    run(["add", ws, "--desc", "x", "--today", "2026-06-16"]);
    expect(readFileSync(join(ws, "risks", "register.md"), "utf8")).toContain("# Risk Register — acme");
  });
});
