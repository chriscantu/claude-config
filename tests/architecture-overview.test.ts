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
