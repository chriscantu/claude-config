import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// bin/setup-project-local.fish finds the repo from its own location, so each
// test copies it into a throwaway repo (bin/ + .claude/) and points HOME at a
// fake home. The real repo's settings.local.json is never touched.

const SCRIPT = resolve(import.meta.dir, "..", "bin", "setup-project-local.fish");
const sandboxes: string[] = [];

function makeSandbox() {
  const dir = mkdtempSync(join(tmpdir(), "setup-project-local-"));
  sandboxes.push(dir);
  mkdirSync(join(dir, "bin"));
  mkdirSync(join(dir, ".claude"));
  copyFileSync(SCRIPT, join(dir, "bin", "setup-project-local.fish"));
  const home = join(dir, "home");
  const settings = join(dir, ".claude", "settings.local.json");
  const run = () =>
    spawnSync("fish", [join(dir, "bin", "setup-project-local.fish")], {
      env: { ...process.env, HOME: home },
      encoding: "utf8",
    });
  return { dir, home, settings, run };
}

afterEach(() => {
  for (const dir of sandboxes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("bin/setup-project-local.fish", () => {
  test("adds $HOME/presentations to a fresh settings.local.json", () => {
    const box = makeSandbox();
    expect(box.run().status).toBe(0);
    const settings = JSON.parse(readFileSync(box.settings, "utf8"));
    expect(settings.permissions.additionalDirectories).toEqual([join(box.home, "presentations")]);
  });

  test("a second run leaves the file byte-identical", () => {
    const box = makeSandbox();
    expect(box.run().status).toBe(0);
    const first = readFileSync(box.settings, "utf8");
    expect(box.run().status).toBe(0);
    expect(readFileSync(box.settings, "utf8")).toBe(first);
  });

  test("keeps existing local settings", () => {
    const box = makeSandbox();
    writeFileSync(
      box.settings,
      JSON.stringify({ model: "x", permissions: { allow: ["Bash(ls)"], additionalDirectories: ["/other"] } }),
    );
    expect(box.run().status).toBe(0);
    const settings = JSON.parse(readFileSync(box.settings, "utf8"));
    expect(settings.model).toBe("x");
    expect(settings.permissions.allow).toEqual(["Bash(ls)"]);
    expect(settings.permissions.additionalDirectories).toEqual(
      expect.arrayContaining(["/other", join(box.home, "presentations")]),
    );
  });

  test("refuses to modify malformed JSON", () => {
    const box = makeSandbox();
    writeFileSync(box.settings, "{ not json");
    expect(box.run().status).toBe(1);
    expect(readFileSync(box.settings, "utf8")).toBe("{ not json");
  });

  test("creates no launch.json", () => {
    const box = makeSandbox();
    expect(box.run().status).toBe(0);
    expect(existsSync(join(box.dir, ".claude", "launch.json"))).toBe(false);
  });
});
