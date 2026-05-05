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
