# /architecture-overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/architecture-overview` — a discovery-mode multi-repo skill that produces a 4-file landscape bundle (inventory, dependencies, data flow, integrations) using vocabulary from the shared `LANGUAGE.md` (Module / Interface / Depth / Seam / Adapter / Leverage / Locality), with deterministic metrics from a Bun TS helper.

**Architecture:** Hybrid skill. `SKILL.md` orchestrates Explore subagent (narrative) + `bin/architecture-overview/repo-stats.ts` (metrics) per repo, then aggregates and renders 4 markdown files. Italic = inferred; plain = code-grounded. URL inputs clone to a configurable cache. `LANGUAGE.md` promoted to a shared root so future skills can reference the same vocabulary without coupling to `improve-codebase-architecture`.

**Tech Stack:** Bun (TS runtime), `bunx` for tool invocations, fish for any shell scripting, plain markdown for skill body. No new runtime dependencies — relies on Bun stdlib + git CLI.

**Spec:** [`docs/superpowers/specs/2026-05-05-architecture-overview-design.md`](../specs/2026-05-05-architecture-overview-design.md)

**Issue:** [#44](https://github.com/cantucodemo/claude-config/issues/44)

---

## File Structure

**New:**

```
references/architecture-language.md                              # promoted from improve-codebase-architecture
skills/architecture-overview/SKILL.md
skills/architecture-overview/references/output-format.md
skills/architecture-overview/references/repo-requirements.md
skills/architecture-overview/evals/evals.json
bin/architecture-overview/repo-stats.ts
commands/architecture-overview.md
tests/architecture-overview.test.ts
tests/fixtures/architecture-overview/ts-only/...
tests/fixtures/architecture-overview/go-only/...
tests/fixtures/architecture-overview/monorepo/...
tests/fixtures/architecture-overview/no-manifest/...
tests/fixtures/architecture-overview/non-git/...
tests/fixtures/architecture-overview/empty/.gitkeep
```

**Modified:**

```
skills/improve-codebase-architecture/SKILL.md   # update LANGUAGE.md references (5 occurrences)
tests/required-concepts.txt                     # append vocab patterns
```

**Deleted:**

```
skills/improve-codebase-architecture/references/LANGUAGE.md   # moved to references/architecture-language.md
```

---

## Branch Setup

Before Task 1, create and switch to a feature branch:

```fish
git checkout -b feature/architecture-overview
```

All commits land on this branch; PR opens at end.

---

## Task 1: Promote LANGUAGE.md to shared root

**Files:**
- Move: `skills/improve-codebase-architecture/references/LANGUAGE.md` → `references/architecture-language.md`
- Modify: `skills/improve-codebase-architecture/SKILL.md` (5 reference occurrences)

- [ ] **Step 1: Move the file**

```fish
mkdir -p references
git mv skills/improve-codebase-architecture/references/LANGUAGE.md references/architecture-language.md
```

- [ ] **Step 2: Update references in `skills/improve-codebase-architecture/SKILL.md`**

Replace every `references/LANGUAGE.md` with `../../references/architecture-language.md`. Use:

```fish
sed -i '' 's|references/LANGUAGE.md|../../references/architecture-language.md|g' skills/improve-codebase-architecture/SKILL.md
```

- [ ] **Step 3: Verify no stale references remain**

```fish
grep -rn 'references/LANGUAGE.md' skills/ rules/ commands/
```

Expected: no output (zero matches). If matches appear, update each one to the new path.

- [ ] **Step 4: Verify validate.fish still passes**

```fish
fish validate.fish
```

Expected: `✓ All checks passed` (or equivalent — exit 0).

- [ ] **Step 5: Commit**

```fish
git add references/architecture-language.md skills/improve-codebase-architecture/SKILL.md skills/improve-codebase-architecture/references/
git commit -m "Promote LANGUAGE.md to shared references/architecture-language.md (#44)

Removes install-order coupling between /architecture-overview and
/improve-codebase-architecture. Both skills now reference the same
canonical vocabulary file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add vocabulary concept patterns

**Files:**
- Modify: `tests/required-concepts.txt`

- [ ] **Step 1: Append the architecture vocab section**

Add to the end of `tests/required-concepts.txt`:

```
# Architecture vocabulary (canonical: references/architecture-language.md)
[Mm]odule.*[Ii]nterface | LANGUAGE Module/Interface pair must remain canonical
[Dd]eep.*[Ss]hallow | LANGUAGE depth axis must remain canonical
[Ss]eam | LANGUAGE seam term must remain canonical
[Aa]dapter | LANGUAGE adapter term must remain canonical
[Ll]everage.*[Ll]ocality|[Ll]ocality.*[Ll]everage | LANGUAGE leverage/locality pair must remain canonical
```

- [ ] **Step 2: Run validate.fish to confirm patterns match**

```fish
fish validate.fish
```

Expected: passes. The new patterns must find their terms (the existing `references/architecture-language.md` already contains all of them, so this should be green out-of-the-box).

- [ ] **Step 3: Commit**

```fish
git add tests/required-concepts.txt
git commit -m "Add architecture-vocab concept patterns to required-concepts.txt (#44)

Guards against drift in canonical Module / Interface / Depth / Seam /
Adapter / Leverage / Locality terminology.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Create test fixtures

**Files:**
- Create: `tests/fixtures/architecture-overview/ts-only/{package.json,src/index.ts,tests/index.test.ts}`
- Create: `tests/fixtures/architecture-overview/go-only/{go.mod,main.go}`
- Create: `tests/fixtures/architecture-overview/monorepo/{package.json,services/billing/package.json,services/users/package.json}`
- Create: `tests/fixtures/architecture-overview/no-manifest/{README.md,src/file.txt}`
- Create: `tests/fixtures/architecture-overview/non-git/{package.json,src/index.ts}`
- Create: `tests/fixtures/architecture-overview/empty/.gitkeep`

- [ ] **Step 1: Create ts-only fixture**

```fish
mkdir -p tests/fixtures/architecture-overview/ts-only/{src,tests}
```

`tests/fixtures/architecture-overview/ts-only/package.json`:

```json
{
  "name": "ts-only-fixture",
  "version": "0.0.1",
  "dependencies": { "express": "^4.18.0", "pg": "^8.11.0" },
  "devDependencies": { "vitest": "^1.0.0" }
}
```

`tests/fixtures/architecture-overview/ts-only/src/index.ts`:

```typescript
import express from "express";
const app = express();
app.get("/", (_req, res) => res.send("ok"));
export { app };
```

`tests/fixtures/architecture-overview/ts-only/tests/index.test.ts`:

```typescript
import { app } from "../src/index";
test("app exports", () => { expect(app).toBeDefined(); });
```

- [ ] **Step 2: Create go-only fixture**

```fish
mkdir -p tests/fixtures/architecture-overview/go-only
```

`tests/fixtures/architecture-overview/go-only/go.mod`:

```
module fixture/go-only

go 1.22

require github.com/lib/pq v1.10.9
```

`tests/fixtures/architecture-overview/go-only/main.go`:

```go
package main

import "github.com/lib/pq"

func main() {
    _ = pq.Driver{}
}
```

- [ ] **Step 3: Create monorepo fixture**

```fish
mkdir -p tests/fixtures/architecture-overview/monorepo/services/{billing,users}
```

`tests/fixtures/architecture-overview/monorepo/package.json`:

```json
{ "name": "monorepo-fixture", "private": true, "workspaces": ["services/*"] }
```

`tests/fixtures/architecture-overview/monorepo/services/billing/package.json`:

```json
{ "name": "@fixture/billing", "dependencies": { "stripe": "^14.0.0" } }
```

`tests/fixtures/architecture-overview/monorepo/services/users/package.json`:

```json
{ "name": "@fixture/users", "dependencies": { "bcrypt": "^5.1.0" } }
```

- [ ] **Step 4: Create no-manifest fixture**

```fish
mkdir -p tests/fixtures/architecture-overview/no-manifest/src
```

`tests/fixtures/architecture-overview/no-manifest/README.md`:

```markdown
# no-manifest

A repo with no dependency manifest. Source is plain text.
```

`tests/fixtures/architecture-overview/no-manifest/src/file.txt`:

```
plain text payload
```

- [ ] **Step 5: Create non-git fixture**

```fish
mkdir -p tests/fixtures/architecture-overview/non-git/src
```

`tests/fixtures/architecture-overview/non-git/package.json`:

```json
{ "name": "non-git-fixture", "dependencies": { "lodash": "^4.17.21" } }
```

`tests/fixtures/architecture-overview/non-git/src/index.ts`:

```typescript
import _ from "lodash";
export const noop = () => _.noop();
```

(No `.git/` directory in this fixture — the absence is the test signal.)

- [ ] **Step 6: Create empty fixture**

```fish
mkdir -p tests/fixtures/architecture-overview/empty
touch tests/fixtures/architecture-overview/empty/.gitkeep
```

- [ ] **Step 7: Commit fixtures**

```fish
git add tests/fixtures/architecture-overview/
git commit -m "Add test fixtures for architecture-overview repo-stats helper (#44)

Six fixtures cover the soft-degrade matrix: ts-only, go-only, monorepo,
no-manifest, non-git, empty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: TDD `bin/architecture-overview/repo-stats.ts`

**Files:**
- Create: `bin/architecture-overview/repo-stats.ts`
- Create: `tests/architecture-overview.test.ts`

This task is split into multiple TDD increments — one per output-shape concern. Run each test, see it fail, write minimal code, see it pass, commit.

### 4.1 Bootstrap helper + path validation

- [ ] **Step 1: Write the failing test**

`tests/architecture-overview.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test, verify it fails**

```fish
bun test tests/architecture-overview.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`bin/architecture-overview/repo-stats.ts`:

```typescript
import { existsSync, statSync } from "fs";
import { basename } from "path";

export interface RepoStats {
  name: string;
  path: string;
  git: GitInfo | null;
  languages: Record<string, number>;
  manifests: ManifestEntry[];
  metrics: Metrics;
  integrations: Integrations;
  errors: string[];
}

export interface GitInfo {
  isGitRepo: boolean;
  headSha: string | null;
  lastCommitAt: string | null;
  ageInDays: number | null;
}

export interface ManifestEntry {
  type: string;
  deps?: string[];
  devDeps?: string[];
  error?: string;
}

export interface Metrics {
  fileCount: number;
  loc: number;
  testFileCount: number;
  hasTestDir: boolean;
  todoFixmeCount: number;
}

export interface Integrations {
  envVarsReferenced: string[];
  dockerfilePresent: boolean;
  ciConfigs: string[];
}

export async function repoStats(path: string): Promise<RepoStats> {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`path not readable or not a directory: ${path}`);
  }

  return {
    name: basename(path),
    path,
    git: null,
    languages: {},
    manifests: [],
    metrics: {
      fileCount: 0,
      loc: 0,
      testFileCount: 0,
      hasTestDir: false,
      todoFixmeCount: 0,
    },
    integrations: {
      envVarsReferenced: [],
      dockerfilePresent: false,
      ciConfigs: [],
    },
    errors: [],
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

```fish
bun test tests/architecture-overview.test.ts
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```fish
git add bin/architecture-overview/repo-stats.ts tests/architecture-overview.test.ts
git commit -m "Bootstrap repoStats helper with path validation (#44)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### 4.2 Manifest detection

- [ ] **Step 1: Write the failing tests**

Append to `tests/architecture-overview.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests, verify failures**

```fish
bun test tests/architecture-overview.test.ts
```

Expected: 3 new tests FAIL.

- [ ] **Step 3: Implement manifest scanning**

Add to `bin/architecture-overview/repo-stats.ts` (replace the empty `manifests: []` initialization with a call to `scanManifests(path)`):

```typescript
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const MANIFEST_FILES = [
  "package.json",
  "go.mod",
  "Cargo.toml",
  "pyproject.toml",
  "requirements.txt",
  "Gemfile",
  "pom.xml",
  "build.gradle",
];

function scanManifests(repoPath: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  const files = readdirSync(repoPath);

  for (const file of files) {
    if (!MANIFEST_FILES.includes(file)) continue;
    const fullPath = join(repoPath, file);
    try {
      entries.push(parseManifest(file, readFileSync(fullPath, "utf8")));
    } catch (e) {
      entries.push({ type: file, error: (e as Error).message });
    }
  }

  return entries;
}

function parseManifest(type: string, content: string): ManifestEntry {
  if (type === "package.json") {
    const pkg = JSON.parse(content);
    return {
      type,
      deps: Object.keys(pkg.dependencies ?? {}),
      devDeps: Object.keys(pkg.devDependencies ?? {}),
    };
  }
  if (type === "go.mod") {
    const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/);
    const lines = requireBlock
      ? requireBlock[1].trim().split("\n")
      : content.split("\n").filter((l) => l.trim().startsWith("require "));
    const deps = lines
      .map((l) => l.replace(/^require\s+/, "").trim().split(/\s+/)[0])
      .filter((d) => d && !d.startsWith("//"));
    return { type, deps };
  }
  return { type };
}
```

Update the main `repoStats` to call it:

```typescript
manifests: scanManifests(path),
```

- [ ] **Step 4: Run tests, verify pass**

```fish
bun test tests/architecture-overview.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```fish
git add bin/architecture-overview/repo-stats.ts tests/architecture-overview.test.ts
git commit -m "repoStats: scan package.json + go.mod manifests (#44)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### 4.3 Git info

- [ ] **Step 1: Write the failing tests**

Append to `tests/architecture-overview.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests, verify failures**

Expected: both FAIL — `git` is currently `null`.

- [ ] **Step 3: Implement git scanning**

Add to `bin/architecture-overview/repo-stats.ts`:

```typescript
import { spawnSync } from "child_process";

function scanGit(repoPath: string): GitInfo {
  const dotGit = join(repoPath, ".git");
  if (!existsSync(dotGit)) {
    return { isGitRepo: false, headSha: null, lastCommitAt: null, ageInDays: null };
  }

  const sha = spawnSync("git", ["-C", repoPath, "rev-parse", "HEAD"], { encoding: "utf8" });
  const lastCommit = spawnSync(
    "git",
    ["-C", repoPath, "log", "-1", "--format=%cI"],
    { encoding: "utf8" },
  );

  const headSha = sha.status === 0 ? sha.stdout.trim().slice(0, 12) : null;
  const lastCommitAt = lastCommit.status === 0 ? lastCommit.stdout.trim() : null;
  const ageInDays =
    lastCommitAt !== null
      ? Math.floor((Date.now() - new Date(lastCommitAt).getTime()) / 86_400_000)
      : null;

  return { isGitRepo: true, headSha, lastCommitAt, ageInDays };
}
```

Update `repoStats` to call `scanGit(path)` instead of `null`:

```typescript
git: scanGit(path),
```

- [ ] **Step 4: Run tests, verify pass**

```fish
bun test tests/architecture-overview.test.ts
```

Expected: 7 PASS.

- [ ] **Step 5: Commit**

```fish
git add bin/architecture-overview/repo-stats.ts tests/architecture-overview.test.ts
git commit -m "repoStats: scan .git/ for HEAD sha + last-commit age (#44)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### 4.4 Metrics + integrations

- [ ] **Step 1: Write the failing tests**

Append:

```typescript
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
```

- [ ] **Step 2: Run tests, verify failures**

Expected: 3 FAIL.

- [ ] **Step 3: Implement metric/integration scanning**

Add to `bin/architecture-overview/repo-stats.ts`:

```typescript
import { readFileSync as readFile, readdirSync as readdir, statSync as stat } from "fs";

const SKIP_DIRS = new Set([
  "node_modules", "vendor", ".git", "dist", "build", ".next", "target", "__pycache__",
]);

const TEST_DIR_NAMES = new Set(["tests", "test", "__tests__", "spec"]);

function* walk(root: string, current = root): Generator<string> {
  for (const entry of readdir(current)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(current, entry);
    const st = stat(full);
    if (st.isDirectory()) yield* walk(root, full);
    else if (st.isFile() && st.size <= 1_048_576) yield full;
  }
}

function scanMetrics(repoPath: string): Metrics {
  let fileCount = 0;
  let loc = 0;
  let testFileCount = 0;
  let hasTestDir = false;
  let todoFixmeCount = 0;

  for (const entry of readdir(repoPath)) {
    if (TEST_DIR_NAMES.has(entry)) {
      try {
        if (stat(join(repoPath, entry)).isDirectory()) hasTestDir = true;
      } catch { /* ignore */ }
    }
  }

  for (const filePath of walk(repoPath)) {
    fileCount++;
    if (/(?:^|\/)(?:.*\.test\.|.*_test\.)/.test(filePath)) testFileCount++;
    let content = "";
    try {
      content = readFile(filePath, "utf8");
    } catch { continue; }
    loc += content.split("\n").length;
    todoFixmeCount += (content.match(/\b(?:TODO|FIXME)\b/g) ?? []).length;
  }

  return { fileCount, loc, testFileCount, hasTestDir, todoFixmeCount };
}

function scanIntegrations(repoPath: string): Integrations {
  const envVarsReferenced = new Set<string>();
  let dockerfilePresent = false;
  const ciConfigs: string[] = [];

  if (existsSync(join(repoPath, "Dockerfile"))) dockerfilePresent = true;

  const ghWorkflows = join(repoPath, ".github", "workflows");
  if (existsSync(ghWorkflows)) {
    for (const f of readdir(ghWorkflows)) {
      if (f.endsWith(".yml") || f.endsWith(".yaml")) {
        ciConfigs.push(`.github/workflows/${f}`);
      }
    }
  }

  const ENV_VAR_RE = /\b([A-Z][A-Z0-9_]{2,})\b/g;
  for (const filePath of walk(repoPath)) {
    if (!/\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|env)$/.test(filePath)) continue;
    let content = "";
    try {
      content = readFile(filePath, "utf8");
    } catch { continue; }
    for (const match of content.matchAll(ENV_VAR_RE)) {
      const v = match[1];
      if (/_(?:URL|KEY|TOKEN|SECRET|DSN|HOST|PORT|API)$/.test(v)) {
        envVarsReferenced.add(v);
      }
    }
  }

  return {
    envVarsReferenced: [...envVarsReferenced].sort(),
    dockerfilePresent,
    ciConfigs,
  };
}
```

Update `repoStats` to call them:

```typescript
metrics: scanMetrics(path),
integrations: scanIntegrations(path),
```

- [ ] **Step 4: Run tests, verify pass**

```fish
bun test tests/architecture-overview.test.ts
```

Expected: 10 PASS.

- [ ] **Step 5: Type-check**

```fish
bunx tsc --noEmit bin/architecture-overview/repo-stats.ts
```

Expected: clean (no errors).

- [ ] **Step 6: Commit**

```fish
git add bin/architecture-overview/repo-stats.ts tests/architecture-overview.test.ts
git commit -m "repoStats: walk source for metrics + integrations (#44)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### 4.5 CLI entry point

- [ ] **Step 1: Add CLI guard at the bottom of `bin/architecture-overview/repo-stats.ts`**

```typescript
if (import.meta.main) {
  const args = process.argv.slice(2);
  const repoIdx = args.indexOf("--repo");
  if (repoIdx === -1 || !args[repoIdx + 1]) {
    console.error("usage: bun run repo-stats.ts --repo <path> [--json]");
    process.exit(1);
  }
  repoStats(args[repoIdx + 1])
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
```

- [ ] **Step 2: Smoke-run against ts-only fixture**

```fish
bun run bin/architecture-overview/repo-stats.ts --repo tests/fixtures/architecture-overview/ts-only
```

Expected: JSON output with `name: "ts-only"`, manifests array containing `package.json`, metrics with non-zero `fileCount`.

- [ ] **Step 3: Commit**

```fish
git add bin/architecture-overview/repo-stats.ts
git commit -m "repoStats: add CLI entry point (#44)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Skill references

**Files:**
- Create: `skills/architecture-overview/references/output-format.md`
- Create: `skills/architecture-overview/references/repo-requirements.md`

- [ ] **Step 1: Create the directory structure**

```fish
mkdir -p skills/architecture-overview/references
```

- [ ] **Step 2: Write `output-format.md`**

`skills/architecture-overview/references/output-format.md`:

```markdown
# Output Format — `/architecture-overview` 4-File Bundle

Every bundle ships four files, all sharing the same frontmatter, all italic-marked
inferred claims, plain-text-only on code-grounded claims.

## Common Frontmatter

```yaml
---
generated_by: /architecture-overview
generated_at: 2026-05-05T16:45:00Z
repos:
  - name: billing-service
    path: ~/work/billing
    head_sha: a1b2c3d
language_ref: ../../references/architecture-language.md
---

> *Italics = inferred. Plain = code-grounded.*
```

## File 1 — `inventory.md`

Per-repo entry. Each entry uses LANGUAGE.md vocab:

```markdown
## <repo-name>

**Module**: <one-line synthesis of what this module is>.
**Interface**: <surface visible to callers — protocol, paths, events>.
**Implementation**: <stack + LOC + entry point>.

**Signals**:
- Test surface: <test file count + hasTestDir>
- Last commit: <date> (<N>d ago)
- Manifests: <list>
- TODO/FIXME: <count>

*Likely brittleness*: <observation paragraph, italic>.
```

## File 2 — `dependencies.md`

Edges between modules. Cross-repo edges resolved when a manifest dep matches another
repo's package name.

```markdown
## <source> → <target>
**Seam**: <where the call lives — file path, protocol>.
**Adapter**: <concrete client/handler>.
**Observed via**: <evidence — import statement, env var>.
```

Italic the entire entry when evidence is inferred (e.g., env var implies dependency
but no client found).

## File 3 — `data-flow.md`

Data lifecycle. Numbered steps. Each step `[observed: <evidence>]` or italicized when
inferred.

## File 4 — `integrations.md`

External SaaS / APIs. Per-integration: which repos, evidence, cost / lock-in note.
```

- [ ] **Step 3: Write `repo-requirements.md`**

`skills/architecture-overview/references/repo-requirements.md`:

```markdown
# Repo Requirements — `/architecture-overview`

## Hard (skill refuses)

- Readable directory; URL entries must clone successfully (auth surfaced as
  inferred-only entry, doesn't block other repos).
- Output path writable; refuses to write inside `claude-config`.

## Soft (graceful degrade)

| Missing | Effect |
|---|---|
| `.git/` | No HEAD SHA in frontmatter, no last-commit-age. Marked *"non-git path"* |
| Dependency manifest | `dependencies.md` says *"no manifest detected — deps inferred from import scan only"* |
| `README.md` | Narrative thinner |
| Tests directory | Brittleness signal *"no test surface"* added |
| `CONTEXT.md` / `CONTEXT-MAP.md` | Generic LANGUAGE.md vocab only |
| `docs/adr/` | No ADR cross-reference |

## Auto-skipped

`node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, `.next/`, `target/`,
`__pycache__/`, files > 1 MB, non-UTF8 binaries.

## Edge cases

- **Monorepo with multiple packages** — `repos.yaml` entry can specify
  `packages: [services/billing, services/users]`; each package becomes a separate
  inventory entry.
- **Private repos requiring SSH/token auth** — defers to user's `gh auth` /
  SSH agent. Clone fail → inferred-only entry, not skill error.
- **Empty repo** — produces inventory entry *"newly initialized, no architecture
  surface yet"*.
```

- [ ] **Step 4: Commit**

```fish
git add skills/architecture-overview/references/
git commit -m "Add architecture-overview skill references (#44)

output-format.md describes the 4-file bundle; repo-requirements.md lists
hard / soft / auto-skipped / edge cases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Build `SKILL.md`

**Files:**
- Create: `skills/architecture-overview/SKILL.md`
- Create: `skills/architecture-overview/evals/evals.json`

- [ ] **Step 1: Write `SKILL.md`**

`skills/architecture-overview/SKILL.md`:

````markdown
---
name: architecture-overview
description: Slash-invoked discovery-mode skill that scans multiple repos and produces a 4-file landscape bundle (inventory, dependencies, data flow, integrations) using the canonical LANGUAGE.md vocabulary (Module / Interface / Depth / Seam / Adapter / Leverage / Locality). Use when a new senior eng leader needs a credible whole-system mental model on day 3-7 of a ramp. Do NOT use for single-repo deepening grading (use /improve-codebase-architecture), a single architectural choice (use /adr), a system-level design record (use /sdr), or tool/framework adoption (use /tech-radar).
disable-model-invocation: true
status: experimental
version: 0.1.0
---

# Architecture Overview

Discovery-mode multi-repo landscape mapper. Walks each repo with an Explore subagent
for narrative discovery and runs `bin/architecture-overview/repo-stats.ts` for
deterministic metrics. Produces 4 markdown files using shared architectural
vocabulary so downstream skills (notably `/improve-codebase-architecture`) consume
without retranslation.

**Announce at start:** "I'm using the architecture-overview skill to produce a
discovery-mode landscape across the supplied repos."

## When To Use

- New eng leader needs day-3 whole-system mental model
- User explicitly invokes `/architecture-overview`
- User asks to "map the architecture", "produce a landscape doc", "list the services"

## When NOT To Use

- Single-repo deepening grading → `/improve-codebase-architecture`
- Single architectural choice with named alternatives → `/adr`
- System-level design record → `/sdr`
- Tool/framework adoption evaluation → `/tech-radar`

## Inputs

- `--repos <yaml-or-csv>` — path to a `repos.yaml` config OR comma-separated paths/URLs
- `--output <path>` — override default output dir
- `--clone-cache <path>` — override URL clone target (default `~/.cache/architecture-overview/`)
- `--no-fetch` — skip `git fetch` on already-cached URL clones

## Glossary (canonical: [`references/architecture-language.md`](../../references/architecture-language.md))

Use these terms exactly:

- **Module** — anything with an interface and an implementation
- **Interface** — everything a caller must know
- **Implementation** — what's inside
- **Depth** — leverage at the interface
- **Seam** — where the interface lives
- **Adapter** — concrete thing satisfying an interface at a seam
- **Leverage** — what callers get from depth
- **Locality** — what maintainers get from depth

Avoid: "component", "service", "API", "boundary".

## Process

### 1. Parse Input

Resolve `--repos` into `[{name, source: path | url}]`. Reject unparseable entries
with a clear error.

### 2. Cache Prompt (URL Inputs Only)

If any entry is a URL AND `--clone-cache` was not supplied, emit a conversational
prompt:

> "I'll need to clone the URL repos. Default cache: `~/.cache/architecture-overview/`.
> Press enter or type 'default' to accept, or supply a path."

Wait for user reply. Treat empty / "default" / "yes" as accept-default.

### 3. Resolve Repos (Parallel)

For each entry:

- **Path** → verify readable directory; bail-soft on error (record in repo entry,
  don't abort the whole run).
- **URL** → `git clone --depth=1 <url> <cache>/<host>/<owner>/<repo>` if not
  already present; `git fetch --depth=1` unless `--no-fetch`. Auth failures surface
  as inferred-only inventory entries.

### 4. Walk (Parallel per Repo)

Two parallel sources per repo:

- **`Explore` subagent** for narrative — read `CONTEXT.md` / ADRs if present,
  walk source, produce inventory / dependencies / data-flow / integrations
  narrative. Italic-default — only mark a claim plain when the agent cites file:line
  evidence.
- **`bunx run bin/architecture-overview/repo-stats.ts --repo <path> --json`** for
  deterministic metrics — capture stdout JSON.

### 5. Aggregate

Merge per-repo records (narrative + metrics) in memory. Cross-repo edge resolution:
if repo A has a manifest dep matching repo B's package name, emit edge `A → B
[observed]`.

### 6. Vocab Pass

Rewrite all narrative claims using LANGUAGE.md terms. If a target repo has
`CONTEXT.md`, apply its domain terms inline. Italic-mark claims without explicit
code evidence.

### 7. Output Guardrails

- Refuse if resolved output path is inside `claude-config` (verified via
  `git rev-parse --show-toplevel` from the output dir).
- Default output resolution:
  - Exactly one `~/repos/onboard-*/` workspace exists → default to
    `<workspace>/architecture/`.
  - Zero workspaces OR more than one → require `--output <path>`. Print candidates
    if multiple.

### 8. Render

Write 4 files at the resolved output path. Frontmatter format defined in
[`references/output-format.md`](references/output-format.md).

### 9. Done

Print summary:

> "Wrote 4 files at `<path>`. <N> repos scanned. <M> errors (see frontmatter)."

## Composition

- **`/improve-codebase-architecture`** — consumes this output (loose composition;
  vocabulary is the contract). Run this skill first; user holds bundle context
  while running the deepening-grader.
- **`/onboard`** — leader's broader ramp toolkit. Future versions may auto-invoke
  this skill; for now it is opt-in.

## Repo Requirements

See [`references/repo-requirements.md`](references/repo-requirements.md) for the
hard / soft / auto-skipped / edge-case matrix.

## Known Gaps (v0.1.0 — Experimental)

- Auto-discovery handshake with `/improve-codebase-architecture` not implemented
- ADR-conflict surfacing not implemented (skill reads ADRs but doesn't grade)
- Brittleness heuristic nomination deferred (observation-only)
- Mermaid graph render deferred (text output only)
- Concept-validation phase enforcing italic-on-inferred deferred (convention only)
````

- [ ] **Step 2: Write minimal `evals.json`**

`skills/architecture-overview/evals/evals.json`:

```json
{
  "skill": "architecture-overview",
  "evals": [
    {
      "name": "produces-bundle-from-yaml",
      "prompt": "/architecture-overview --repos tests/fixtures/architecture-overview/ts-only --output /tmp/arch-overview-eval",
      "assertions": [
        { "type": "file_exists", "path": "/tmp/arch-overview-eval/inventory.md" },
        { "type": "file_exists", "path": "/tmp/arch-overview-eval/dependencies.md" },
        { "type": "file_exists", "path": "/tmp/arch-overview-eval/data-flow.md" },
        { "type": "file_exists", "path": "/tmp/arch-overview-eval/integrations.md" }
      ]
    },
    {
      "name": "uses-language-vocabulary",
      "prompt": "/architecture-overview --repos tests/fixtures/architecture-overview/ts-only --output /tmp/arch-overview-vocab",
      "assertions": [
        { "type": "file_contains", "path": "/tmp/arch-overview-vocab/inventory.md", "regex": "\\*\\*Module\\*\\*|\\*\\*Interface\\*\\*" }
      ]
    },
    {
      "name": "italic-marks-inferences",
      "prompt": "/architecture-overview --repos tests/fixtures/architecture-overview/no-manifest --output /tmp/arch-overview-italic",
      "assertions": [
        { "type": "file_contains", "path": "/tmp/arch-overview-italic/dependencies.md", "regex": "\\*[^*]+\\*" }
      ]
    },
    {
      "name": "refuses-output-inside-claude-config",
      "prompt": "/architecture-overview --repos tests/fixtures/architecture-overview/empty --output ./docs/test-bad-output",
      "assertions": [
        { "type": "response_contains", "regex": "refuses?.*claude-config|inside.*claude-config" }
      ]
    }
  ]
}
```

- [ ] **Step 3: Verify validate.fish still passes**

```fish
fish validate.fish
```

Expected: clean.

- [ ] **Step 4: Commit**

```fish
git add skills/architecture-overview/SKILL.md skills/architecture-overview/evals/
git commit -m "Add architecture-overview SKILL.md + evals (#44)

Orchestrates Explore (narrative) + repo-stats.ts (metrics) per repo,
applies LANGUAGE.md vocab, renders 4-file bundle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Slash command + symlink install

**Files:**
- Create: `commands/architecture-overview.md`

- [ ] **Step 1: Write the slash command**

`commands/architecture-overview.md`:

```markdown
---
description: Discovery-mode multi-repo technical landscape — produces 4-file bundle (inventory, dependencies, data flow, integrations) using LANGUAGE.md vocab. Use for new-leader codebase ramp. Do NOT use for single-repo grading (/improve-codebase-architecture) or new-system design (/sdr).
argument-hint: --repos <yaml-or-csv> [--output <path>] [--clone-cache <path>] [--no-fetch]
---

Invoke the architecture-overview skill with the supplied arguments.
```

- [ ] **Step 2: Run install script**

```fish
./bin/link-config.fish
```

Expected: `commands/architecture-overview.md` symlinked into `~/.claude/commands/architecture-overview.md`.

- [ ] **Step 3: Verify install check passes**

```fish
./bin/link-config.fish --check
```

Expected: exit 0, no missing symlinks.

- [ ] **Step 4: Verify validate.fish still passes**

```fish
fish validate.fish
```

Expected: clean.

- [ ] **Step 5: Commit**

```fish
git add commands/architecture-overview.md
git commit -m "Add /architecture-overview slash command (#44)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: End-to-end smoke test

This task verifies the skill works against a real repo (`claude-config` itself, used as a self-test fixture). Outputs go to `/tmp` to avoid polluting the working tree.

- [ ] **Step 1: Run repo-stats.ts against claude-config**

```fish
bun run bin/architecture-overview/repo-stats.ts --repo . | head -50
```

Expected: JSON output with `name: "claude-config"`, manifests array including no `package.json` at root (claude-config has none), metrics with sane file counts.

- [ ] **Step 2: Run `/architecture-overview` end-to-end (manual session)**

This step requires opening a fresh Claude Code session. Document the run in the commit message rather than scripting it.

```fish
# In a separate Claude Code session:
# /architecture-overview --repos . --output /tmp/arch-overview-smoke
```

Expected after the session runs:

- 4 files exist at `/tmp/arch-overview-smoke/`: `inventory.md`, `dependencies.md`, `data-flow.md`, `integrations.md`
- All 4 files have valid YAML frontmatter (parseable; contains `generated_at`, `repos[].head_sha`)
- `inventory.md` uses **Module** / **Interface** / **Implementation** headings
- At least one italicized passage appears (inferred claim)
- No file written inside `claude-config` working tree

- [ ] **Step 3: Tear down smoke output**

```fish
rm -rf /tmp/arch-overview-smoke
```

- [ ] **Step 4: Final verification**

```fish
fish validate.fish
./bin/link-config.fish --check
bun test tests/architecture-overview.test.ts
bunx tsc --noEmit
```

Expected: all four green.

- [ ] **Step 5: Commit (no functional change — verification record)**

If anything was discovered during smoke that required a fix, commit the fix here and reference this task. Otherwise, no commit.

---

## Task 9: Open the PR

- [ ] **Step 1: Push branch**

```fish
git push -u origin feature/architecture-overview
```

- [ ] **Step 2: Open PR**

```fish
echo "## Summary
- Ship /architecture-overview discovery-mode multi-repo skill (#44)
- Promote LANGUAGE.md to shared references/ root so vocab is reusable
- Add bin/architecture-overview/repo-stats.ts (Bun) for deterministic metrics
- Supersede 2026-04-26 spec with 2026-05-05 (4-file bundle, italic markers, URL input)

## Test plan
- [ ] \`fish validate.fish\` passes
- [ ] \`./bin/link-config.fish --check\` passes
- [ ] \`bun test tests/architecture-overview.test.ts\` all green (10 tests)
- [ ] \`bunx tsc --noEmit\` clean
- [ ] Smoke: /architecture-overview against claude-config produces 4 valid markdown files with italic markers
- [ ] Smoke: URL input clones to cache and renders inventory entry

🤖 Generated with [Claude Code](https://claude.com/claude-code)" > /tmp/pr-body.md

gh pr create --title "Ship /architecture-overview — multi-repo landscape with shared LANGUAGE.md (#44)" --body-file /tmp/pr-body.md
```

- [ ] **Step 3: Print PR URL**

```fish
gh pr view --json url --jq .url
```

Hand the URL back to the user.

---

## Self-Review Notes

- Spec coverage: each "Acceptance Criteria" bullet from the spec maps to at least one task — Task 1 covers LANGUAGE.md promotion + reference updates; Task 2 covers concept patterns; Task 3-4 covers helper script + tests; Task 5 covers references; Task 6 covers SKILL.md + evals; Task 7 covers slash command + install check; Task 8 covers smoke (`tsc --noEmit`, `validate.fish`, `link-config.fish --check`, end-to-end on claude-config + URL input).
- Placeholder scan: no TBD / TODO / "implement later" appears in any step. Every code step ships full code.
- Type consistency: `RepoStats`, `GitInfo`, `ManifestEntry`, `Metrics`, `Integrations` types defined in Task 4.1 are used consistently in 4.2-4.5. `repoStats` function name unchanged across tasks.
- One known gap: Task 8 Step 2 requires a fresh Claude Code session for end-to-end smoke. This is intentional — `/architecture-overview` is a Skill-tool invocation, not a CLI command, so it cannot be scripted from inside the implementing session without recursion. The verification is performed by the user in the test plan.
