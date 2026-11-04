import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The sketch template is the starting point for every fat marker sketch, which
// is published with the built-in Artifact tool. These tests guard two things
// the template must keep doing: stay low-fidelity (a crude marker drawing, not
// a styled page) and meet the Artifact page contract so it renders the same
// for every viewer.

const TEMPLATE = join(
  import.meta.dir,
  "..",
  "skills",
  "fat-marker-sketch",
  "assets",
  "sketch-template.html",
);
const html = readFileSync(TEMPLATE, "utf8");
const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)]
  .map((m) => m[1])
  .join("\n");
const inlineStyles = [...html.matchAll(/style="([^"]*)"/g)]
  .map((m) => m[1])
  .join("\n");
const allStyles = `${css}\n${inlineStyles}`;

describe("sketch template stays low-fidelity", () => {
  test("uses only black and white", () => {
    const colors = allStyles.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) ?? [];
    const allowed = new Set(["#000", "#000000", "#fff", "#ffffff"]);
    const others = colors.filter((c) => !allowed.has(c.toLowerCase()));
    expect(others).toEqual([]);
  });

  test("uses one marker typeface, not a font pairing", () => {
    const families = allStyles.match(/font-family:[^;}"]*/g) ?? [];
    expect(families.length).toBeGreaterThan(0);
    for (const f of families) expect(f).toContain("Permanent Marker");
  });

  test("has no shadows, gradients, fills, or images", () => {
    expect(allStyles).not.toMatch(/box-shadow|text-shadow|gradient|filter:/i);
    expect(allStyles).not.toMatch(/background(-color)?:(?!\s*(var\(--paper\)|#fff))/i);
    expect(html).not.toMatch(/<img|<svg|<canvas|<script/i);
  });

  test("boxes are thick borders with uneven corners", () => {
    expect(allStyles).toMatch(/border:\s*4px solid/);
    expect(allStyles).toMatch(/border:\s*3px solid/);
    const radii = new Set(html.match(/border-radius:\s*[\dpx ]+/g) ?? []);
    expect(radii.size).toBeGreaterThanOrEqual(3);
  });

  test("uses ASCII-only content", () => {
    expect(html).toMatch(/^[\x00-\x7F]*$/);
  });

  test("has a FLOW section", () => {
    expect(html).toContain("FLOW");
  });
});

describe("sketch template meets the Artifact page contract", () => {
  test("has a title near the top", () => {
    expect(html.slice(0, 8192)).toMatch(/<title>[^<]+<\/title>/);
  });

  test("brings no document skeleton of its own", () => {
    expect(html).not.toMatch(/<!doctype|<html|<head|<body/i);
  });

  test("sets an explicit page background so the host theme never shows", () => {
    expect(css).toMatch(/body\s*\{[^}]*background:\s*var\(--paper\)/);
    expect(css).toMatch(/--paper:\s*#fff/);
  });

  test("keeps a safe side gutter and declares it", () => {
    expect(html).toContain('<meta name="claude:viewport-fit-sides" content="cover">');
    expect(css).toContain("padding-left: max(16px, env(safe-area-inset-left, 0px))");
    expect(css).toContain("padding-right: max(16px, env(safe-area-inset-right, 0px))");
  });

  test("loads its font only from Google Fonts, with a fallback", () => {
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    for (const h of hrefs) expect(h.startsWith("https://fonts.googleapis.com/")).toBe(true);
    expect(allStyles).toMatch(/'Permanent Marker',[^;]*cursive/);
  });

  test("wraps screens instead of forcing a wide page", () => {
    expect(css).toMatch(/flex-wrap:\s*wrap/);
    expect(allStyles).not.toMatch(/min-width:\s*(\d{4,}|[4-9]\d\d)px/);
  });
});
