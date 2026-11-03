import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// stakeholder-map and swot draw their visuals from HTML templates (they used
// to draw on an Excalidraw canvas). These tests keep each template renderable
// for every viewer and keep the classes its render spec tells Claude to use,
// so a spec and its template can't drift apart.

const root = join(import.meta.dir, "..", "skills");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const templates = [
  {
    path: "stakeholder-map/assets/chart-template.html",
    spec: "stakeholder-map/chart-render.md",
    classes: [
      "formal-high", "formal-medium", "formal-low", "formal-unknown",
      "badge-high", "badge-medium", "badge-low",
      "rel-reports_to", "rel-reports_to_informally", "rel-influences",
    ],
  },
  {
    path: "stakeholder-map/assets/heatmap-template.html",
    spec: "stakeholder-map/heatmap-render.md",
    classes: ["cell-well", "cell-under", "cell-gap", "cell-unknown", "cell-empty-slot"],
  },
  {
    path: "swot/assets/swot-template.html",
    spec: "swot/export-formats.md",
    classes: [],
  },
];

for (const t of templates) {
  const html = read(t.path);
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");

  describe(t.path, () => {
    test("has a title near the top", () => {
      expect(html.slice(0, 8192)).toMatch(/<title>[^<]+<\/title>/);
    });

    test("brings no document skeleton of its own", () => {
      expect(html).not.toMatch(/<!doctype|<html|<head|<body/i);
    });

    test("sets an explicit body background and text color from tokens", () => {
      expect(css).toMatch(/body\s*\{[^}]*background:\s*var\(--[a-z]+\)/);
      expect(css).toMatch(/body\s*\{[^}]*color:\s*var\(--[a-z]+\)/);
    });

    test("keeps a safe side gutter and declares it", () => {
      expect(html).toContain('<meta name="claude:viewport-fit-sides" content="cover">');
      expect(css).toContain("padding-left: max(16px, env(safe-area-inset-left, 0px))");
      expect(css).toContain("padding-right: max(16px, env(safe-area-inset-right, 0px))");
    });

    test("loads nothing from outside the page", () => {
      expect(html).not.toMatch(/<script|<img|<iframe/i);
      expect(html).not.toMatch(/https?:\/\//);
    });

    test("uses ASCII-only content", () => {
      expect(html).toMatch(/^[\x00-\x7F]*$/);
    });

    test("mentions no Excalidraw tooling", () => {
      expect(html).not.toMatch(/excalidraw/i);
      expect(read(t.spec)).not.toMatch(/excalidraw|batch_create_elements|describe_scene/i);
    });

    for (const c of t.classes) {
      test(`styles .${c}, which the render spec uses`, () => {
        expect(css).toMatch(new RegExp(`\\.${c}\\b`));
        expect(read(t.spec)).toContain(c);
      });
    }
  });
}

describe("stakeholder-map stays local", () => {
  test("render specs forbid publishing the people data", () => {
    for (const spec of ["stakeholder-map/chart-render.md", "stakeholder-map/heatmap-render.md"]) {
      expect(read(spec)).toMatch(/Never publish it with the Artifact tool/);
    }
  });
});
