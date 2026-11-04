import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// stakeholder-map and swot draw their visuals by filling HTML templates.
// Each render spec is the single source of truth for the classes and encodings
// Claude uses, so these tests read the spec and check the template against it.
// Two page kinds exist: stakeholder-map pages are opened as local files and
// must carry their own document skeleton; the SWOT page is published with the
// Artifact tool, which supplies the skeleton, so it must not bring one.

const skillsDir = join(import.meta.dir, "..", "skills");
const read = (p: string) => readFileSync(join(skillsDir, p), "utf8");

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function cssOf(html: string): string {
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Declarations of every rule whose selector list names the class exactly
// (`.cell-well` must not match `.cell-well-x`).
function rulesFor(css: string, cls: string): string {
  const selector = new RegExp(`\\.${escapeRegex(cls)}(?![\\w-])`);
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => selector.test(m[1]))
    .map((m) => m[2])
    .join(";");
}

type ClassRow = { cls: string; look: string };

// Rows of every markdown table that has a "Class" column; `look` is the last
// column, which describes the visual encoding (box, line, or border).
function tableClassRows(md: string): ClassRow[] {
  const rows: ClassRow[] = [];
  let classCol = -1;
  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) {
      classCol = -1;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const header = cells.findIndex((c) => /^class$/i.test(c));
    if (header >= 0) {
      classCol = header;
      continue;
    }
    const cls = cells[classCol]?.match(/^`([\w-]+)`$/)?.[1];
    if (classCol >= 0 && cls) rows.push({ cls, look: cells[cells.length - 1] });
  }
  return rows;
}

// Rows inside a Class table whose class cell isn't one bare backticked class.
// tableClassRows skips such rows, so without this check a typo in the spec
// would silently drop that class from every encoding test.
function unreadableClassRows(md: string): string[] {
  const bad: string[] = [];
  let classCol = -1;
  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) {
      classCol = -1;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const header = cells.findIndex((c) => /^class$/i.test(c));
    if (header >= 0) {
      classCol = header;
      continue;
    }
    const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));
    if (classCol >= 0 && !isSeparator && !/^`[\w-]+`$/.test(cells[classCol] ?? "")) bad.push(line);
  }
  return bad;
}

// The heatmap spec takes its "Where it goes" rules from the chart spec by link,
// so checks on those rules read the linked section too.
function withSharedRules(md: string): string {
  if (!md.includes("chart-render.md#where-it-goes")) return md;
  const shared = read("stakeholder-map/chart-render.md").match(/## Where it goes\n([\s\S]*?)\n## /)?.[1] ?? "";
  return `${md}\n${shared}`;
}

// Every class the spec tells Claude to use: Class-column table cells,
// backticked `.class` tokens, and class="..." attributes (split on space and |).
function specClasses(md: string): string[] {
  const found = new Set(tableClassRows(md).map((r) => r.cls));
  for (const m of md.matchAll(/`\.([a-z][\w-]*)`/g)) found.add(m[1]);
  for (const m of md.matchAll(/class="([^"]+)"/g)) {
    for (const c of m[1].split(/[\s|]+/)) if (c) found.add(c);
  }
  return [...found].sort();
}

const pages = [
  {
    path: "stakeholder-map/assets/chart-template.html",
    spec: "stakeholder-map/chart-render.md",
    kind: "local",
  },
  {
    path: "stakeholder-map/assets/heatmap-template.html",
    spec: "stakeholder-map/heatmap-render.md",
    kind: "local",
  },
  {
    path: "swot/assets/swot-template.html",
    spec: "swot/export-formats.md",
    kind: "published",
  },
] as const;

for (const page of pages) {
  const html = read(page.path);
  const css = cssOf(html);
  const spec = withSharedRules(read(page.spec));

  describe(page.path, () => {
    // The Artifact tool reads the title from the first 8 KB of the page.
    test("has a title in the first 8 KB", () => {
      expect(html.slice(0, 8192)).toMatch(/<title>[^<]+<\/title>/);
    });

    test("sets an explicit body background and text color from tokens", () => {
      expect(css).toMatch(/body\s*\{[^}]*background:\s*var\(--[a-z]+\)/);
      expect(css).toMatch(/body\s*\{[^}]*color:\s*var\(--[a-z]+\)/);
    });

    test("keeps a 16px side gutter", () => {
      expect(css).toMatch(/padding-left:\s*max\(\s*16px\s*,\s*env\(\s*safe-area-inset-left/);
      expect(css).toMatch(/padding-right:\s*max\(\s*16px\s*,\s*env\(\s*safe-area-inset-right/);
    });

    test("loads no outside resources", () => {
      expect(html).not.toMatch(/<(script|img|iframe|link|object|embed|video|audio|source)\b/i);
      expect(html).not.toMatch(/@import|url\(/i);
      expect(html).not.toMatch(/(https?:)?\/\/[a-z0-9]/i);
    });

    test("spec tells Claude to HTML-escape inserted text", () => {
      expect(spec).toMatch(/HTML-escape/);
    });

    if (page.kind === "local") {
      test("is a standalone page with its own skeleton and UTF-8 charset", () => {
        expect(html).toMatch(/^<!doctype html>/i);
        expect(html).toMatch(/<meta charset="utf-8">/i);
        expect(html).toMatch(/<meta name="viewport"/);
      });
    } else {
      test("brings no document skeleton of its own", () => {
        expect(html).not.toMatch(/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i);
      });

      test("declares the Artifact side-gutter hint", () => {
        expect(html).toMatch(/<meta name="claude:viewport-fit-sides" content="cover">/);
      });
    }

    for (const cls of specClasses(spec)) {
      test(`styles .${cls}, which the spec names`, () => {
        expect(rulesFor(css, cls)).not.toBe("");
      });
    }

    test("every row of the spec's Class tables can be read", () => {
      expect(unreadableClassRows(read(page.spec))).toEqual([]);
    });

    for (const { cls, look } of tableClassRows(spec)) {
      test(`.${cls} draws "${look}" as the spec says`, () => {
        const rules = rulesFor(css, cls);
        // "220px wide" is a width; any other px in a look is a border width.
        for (const [, px, wide] of look.matchAll(/(\d+px)( wide)?/g)) {
          const property = wide ? "width" : "border(?:-[\\w-]+)?";
          expect(rules).toMatch(new RegExp(`(?:^|[;\\s])${property}:[^;]*\\b${px}`));
        }
        if (/\bsolid\b/.test(look)) expect(rules).toMatch(/\bsolid\b/);
        for (const style of ["dashed", "dotted", "double"]) {
          if (look.includes(style)) expect(rules).toContain(style);
          else expect(rules).not.toContain(style);
        }
        if (look.includes("hatched")) expect(rules).toContain("repeating-linear-gradient");
        else expect(rules).not.toContain("gradient");
      });
    }
  });
}

// With nobody on the map, a page of keys and empty headings explains nothing,
// so the spec must send the reader to onboarding instead of drawing it.
describe("chart with nobody on the map", () => {
  test("spec prints a pointer to onboarding instead of a page", () => {
    const spec = read("stakeholder-map/chart-render.md").replace(/\s+/g, " ");
    expect(spec).toMatch(/If no entity is on the map, don't write or open the page/);
    expect(spec).toMatch(/`Nobody is on the map yet\. Run `?\/stakeholder-map --mode=leader-onboarding/);
  });
});

describe("chart badge", () => {
  test("is drawn as a circle", () => {
    const css = cssOf(read("stakeholder-map/assets/chart-template.html"));
    expect(rulesFor(css, "badge")).toMatch(/border-radius:\s*50%/);
  });
});

describe("render specs name the classes they use", () => {
  test("stakeholder specs yield their core encoding classes", () => {
    expect(specClasses(read("stakeholder-map/chart-render.md"))).toEqual(
      expect.arrayContaining(["formal-unknown", "badge-low", "rel-influences", "node", "name"]),
    );
    expect(specClasses(read("stakeholder-map/heatmap-render.md"))).toEqual(
      expect.arrayContaining(["cell-well", "cell-unknown", "cell-empty-slot", "row-label"]),
    );
  });
});

// A first-time reader decodes the page from its key, so every encoding the
// spec defines must have a sample in the key, drawn with the same class.
describe("each stakeholder key shows every encoding", () => {
  const keyOf = (html: string) => html.match(/<div class="key">([\s\S]*?)(?=<h2>|$)/)?.[1] ?? "";

  test("heatmap key has a swatch for every cell state", () => {
    const key = keyOf(read("stakeholder-map/assets/heatmap-template.html"));
    for (const { cls } of tableClassRows(read("stakeholder-map/heatmap-render.md"))) {
      expect(key).toMatch(new RegExp(`class="swatch ${cls}"`));
    }
  });

  test("chart key has a sample circle for every informal-power level", () => {
    const key = keyOf(read("stakeholder-map/assets/chart-template.html"));
    for (const level of ["low", "medium", "high"]) {
      expect(key).toMatch(new RegExp(`class="badge badge-${level}"`));
    }
  });
});

describe("swot grid page", () => {
  const html = read("swot/assets/swot-template.html");
  const spec = read("swot/export-formats.md");
  const css = cssOf(html);

  test("lays the quadrants out as a 2x2 grid", () => {
    expect(rulesFor(css, "grid")).toMatch(/grid-template-columns:\s*repeat\(2,/);
  });

  test("dark theme swaps to dark paper and light ink", () => {
    const light = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
    const dark = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] ?? "";
    const token = (block: string, name: string) => block.match(new RegExp(`--${name}:\\s*([^;]+)`))?.[1];
    for (const name of ["bg", "fg"]) {
      expect(token(dark, name)).toBeDefined();
      expect(token(dark, name)).not.toBe(token(light, name));
    }
  });

  test("the republish lookup title matches the template title", () => {
    const lookup = spec.match(/titled\s+`([^`<]+)<Org Name>`/)?.[1];
    expect(lookup).toBeDefined();
    expect(html).toContain(`<title>${lookup}Org Name</title>`);
  });

  // The landscape tag is optional in the graph, so the grid needs a line shape
  // for entries that have none, or each run would invent its own.
  test("spec says how to show an entry with no landscape tag", () => {
    const flat = spec.replace(/\s+/g, " ");
    expect(flat).toMatch(/An entry with no landscape tag is `<li>\{observation text\}<\/li>`/);
    expect(flat).toMatch(/after the tagged ones/);
  });

  test("local fallback adds the charset the Artifact wrapper would", () => {
    expect(spec).toMatch(/<meta charset="utf-8">/);
  });

  test("has all four quadrants", () => {
    for (const q of ["STRENGTHS", "WEAKNESSES", "OPPORTUNITIES", "THREATS"]) {
      expect(html).toMatch(new RegExp(`<h2>${q}</h2>`));
    }
  });

  test("puts the Org Name placeholder in the title and heading", () => {
    expect(html).toMatch(/<title>[^<]*Org Name[^<]*<\/title>/);
    expect(html).toMatch(/<h1>[^<]*Org Name[^<]*<\/h1>/);
  });

  test("follows the viewer's light or dark theme", () => {
    expect(html).toMatch(/prefers-color-scheme:\s*dark/);
    expect(html).toMatch(/:root\[data-theme="dark"\]/);
  });
});

// Person entities hold sensitive assessments. The Privacy section of SKILL.md
// is the only place allowed to talk about publishing, and it may not carve out
// an exception. Any other mention of publishing or uploading in the skill is
// treated as a leak path.
describe("stakeholder-map stays local", () => {
  const skill = read("stakeholder-map/SKILL.md");
  const privacy = skill.match(/## Privacy\n([\s\S]*?)\n## /)?.[1] ?? "";

  test("the Privacy section forbids publishing with no exception", () => {
    expect(privacy).toMatch(/\b(never|do not|don't)\s+publish/i);
    expect(privacy).not.toMatch(/\b(unless|except|only if|only when)\b/i);
  });

  test("every Privacy sentence about publishing is a prohibition with no way out", () => {
    const sentences = privacy.replace(/\s+/g, " ").split(/(?<=\.)\s/);
    for (const s of sentences.filter((s) => /publish|artifact|upload|gist/i.test(s))) {
      expect(s).toMatch(/\b(never|not)\b|n't\b/i);
      expect(s).not.toMatch(/\b(but|once|when|after|until)\b/i);
    }
  });

  test("both render specs keep the page in the scratchpad and out of the repo", () => {
    for (const spec of ["stakeholder-map/chart-render.md", "stakeholder-map/heatmap-render.md"]) {
      const rules = withSharedRules(read(spec));
      expect(rules).toMatch(/session\s+scratchpad/);
      expect(rules).toMatch(/Never\s+write\s+it\s+into\s+a\s+repo/);
    }
  });

  test("no other skill tells Claude to publish stakeholder-map output", () => {
    const offenders = readdirSync(skillsDir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(".md") && !f.startsWith("stakeholder-map/"))
      .sort()
      .flatMap((f) =>
        read(f)
          .split("\n")
          .filter((line) => /stakeholder/i.test(line) && /publish|upload|gist|\bArtifact tool\b/i.test(line))
          .map((line) => `${f}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  const files = [
    ...readdirSync(join(skillsDir, "stakeholder-map"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => `stakeholder-map/${f}`),
    ...readdirSync(join(skillsDir, "stakeholder-map/assets")).map((f) => `stakeholder-map/assets/${f}`),
  ].sort();

  for (const file of files) {
    test(`${file} says nothing about publishing outside the Privacy section`, () => {
      const text = file === "stakeholder-map/SKILL.md" ? skill.replace(privacy, "") : read(file);
      expect(text).not.toMatch(/publish|artifact|upload|gist/i);
      for (const line of text.split("\n").filter((l) => /\b(share|send|post)\b/i.test(l))) {
        expect(line).toMatch(/\b(never|not|no)\b|n't\b/i);
      }
    });
  }
});
