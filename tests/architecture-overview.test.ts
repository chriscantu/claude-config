import { describe, expect, test } from "bun:test";
import { repoStats } from "../bin/architecture-overview/repo-stats";
import { resolve } from "path";

const fixture = (name: string) =>
  resolve(__dirname, "fixtures/architecture-overview", name);

describe("repoStats — path validation", () => {
  test("returns name + path for a valid fixture", async () => {
    const result = await repoStats(fixture("ts-only"));
    expect(result.name).toBe("ts-only");
    expect(result.path).toBe(fixture("ts-only"));
  });

  test("throws on missing path", async () => {
    await expect(repoStats("/nonexistent/path")).rejects.toThrow();
  });

  test("resolves relative path inputs to absolute name + path", async () => {
    const result = await repoStats(".");
    expect(result.name).not.toBe(".");
    expect(result.path.startsWith("/")).toBe(true);
  });
});

describe("repoStats — manifests", () => {
  test("detects package.json with deps + devDeps", async () => {
    const result = await repoStats(fixture("ts-only"));
    const pkg = result.manifests.find((m) => m.type === "package.json");
    expect(pkg).toBeDefined();
    expect(pkg?.deps).toContain("express");
    expect(pkg?.deps).toContain("pg");
    expect(pkg?.devDeps).toContain("vitest");
  });

  test("detects go.mod deps", async () => {
    const result = await repoStats(fixture("go-only"));
    const gm = result.manifests.find((m) => m.type === "go.mod");
    expect(gm).toBeDefined();
    expect(gm?.deps).toContain("github.com/lib/pq");
  });

  test("returns empty manifests array for no-manifest fixture", async () => {
    const result = await repoStats(fixture("no-manifest"));
    expect(result.manifests).toEqual([]);
  });
});

describe("repoStats — git info", () => {
  test("returns isGitRepo: false for non-git fixture", async () => {
    const result = await repoStats(fixture("non-git"));
    expect(result.git?.isGitRepo).toBe(false);
  });

  test("returns isGitRepo: true with HEAD sha for the project root", async () => {
    const result = await repoStats(resolve(__dirname, ".."));
    expect(result.git?.isGitRepo).toBe(true);
    expect(result.git?.headSha).toMatch(/^[0-9a-f]{7,40}$/);
  });
});

describe("repoStats — metrics", () => {
  test("counts files and detects test directory", async () => {
    const result = await repoStats(fixture("ts-only"));
    expect(result.metrics.fileCount).toBeGreaterThan(0);
    expect(result.metrics.hasTestDir).toBe(true);
    expect(result.metrics.testFileCount).toBeGreaterThanOrEqual(1);
  });

  test("hasTestDir is false for fixtures without tests/", async () => {
    const result = await repoStats(fixture("go-only"));
    expect(result.metrics.hasTestDir).toBe(false);
  });
});

describe("repoStats — integrations", () => {
  test("detects env-var references", async () => {
    const result = await repoStats(fixture("ts-only"));
    expect(Array.isArray(result.integrations.envVarsReferenced)).toBe(true);
  });
});

describe("repoStats — languages", () => {
  test("ts-only fixture reports TypeScript dominant", async () => {
    const result = await repoStats(fixture("ts-only"));
    expect(result.languages.TypeScript).toBeGreaterThan(0);
    const total = Object.values(result.languages).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0.99);
    expect(total).toBeLessThanOrEqual(1.01);
  });

  test("go-only fixture reports Go", async () => {
    const result = await repoStats(fixture("go-only"));
    expect(result.languages.Go).toBeGreaterThan(0);
  });

  test("empty fixture returns empty languages", async () => {
    const result = await repoStats(fixture("empty"));
    expect(result.languages).toEqual({});
  });
});

describe("repoStats — monorepo", () => {
  test("monorepo fixture surfaces root manifest with workspaces field", async () => {
    const result = await repoStats(fixture("monorepo"));
    const pkg = result.manifests.find((m) => m.type === "package.json");
    expect(pkg).toBeDefined();
    // Root package.json has no dependencies (only `private` + `workspaces`).
    expect(pkg?.deps ?? []).toEqual([]);
    // Root package.json has no devDependencies in the fixture.
    expect(pkg?.devDeps ?? []).toEqual([]);
  });

  test("monorepo fixture counts files across nested packages", async () => {
    const result = await repoStats(fixture("monorepo"));
    // 1 root package.json + 2 nested service package.json = 3 files
    expect(result.metrics.fileCount).toBe(3);
  });
});
