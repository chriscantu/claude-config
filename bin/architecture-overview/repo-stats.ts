import { spawnSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { basename, extname, join, resolve } from "path";

export interface RepoStats {
  name: string;
  path: string;
  git: GitInfo;
  languages: Record<string, number>;
  manifests: ManifestEntry[];
  metrics: Metrics;
  integrations: Integrations;
}

export type GitInfo =
  | { isGitRepo: false }
  | {
      isGitRepo: true;
      headSha: string | null;
      lastCommitAt: string | null;
      ageInDays: number | null;
    };

export type ManifestEntry =
  | { type: string; deps?: string[]; devDeps?: string[] }
  | { type: string; error: string };

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

const SKIP_DIRS = new Set([
  "node_modules", "vendor", ".git", "dist", "build", ".next", "target", "__pycache__",
]);

const TEST_DIR_NAMES = new Set(["tests", "test", "__tests__", "spec"]);

// --- Module-scoped regex / extension constants ---

const ENV_VAR_RE = /\b([A-Z][A-Z0-9_]{2,})\b/g;
const INFRA_SUFFIX_RE = /_(?:URL|KEY|TOKEN|SECRET|DSN|HOST|PORT|API)$/;

// Matches test files by path segment: foo.test.ts, foo_test.go, etc.
const TEST_FILE_RE = /(?:^|\/)(?:.*\.test\.|.*_test\.)/;

// Counts brittleness signals in source content
const TODO_FIXME_RE = /\b(?:TODO|FIXME)\b/g;

// Extensions whose source content is worth scanning for env var references
const SCANNABLE_SOURCE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".rb", ".java", ".kt", ".env",
]);

// go.mod has two require syntaxes — a parenthesized block (multiple deps) and a flat
// `require pkg version` line (single dep). Helpers below match both.
const GO_MOD_REQUIRE_BLOCK_RE = /require\s*\(([\s\S]*?)\)/;
const GO_MOD_REQUIRE_LINE_PREFIX_RE = /^require\s+/;

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".rb": "Ruby",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
};

function* walk(root: string, current = root): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(current);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(current, entry);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
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

  for (const entry of readdirSync(repoPath)) {
    if (TEST_DIR_NAMES.has(entry)) {
      try {
        if (statSync(join(repoPath, entry)).isDirectory()) hasTestDir = true;
      } catch { /* ignore */ }
    }
  }

  for (const filePath of walk(repoPath)) {
    fileCount++;
    if (TEST_FILE_RE.test(filePath)) testFileCount++;
    let content = "";
    try {
      content = readFileSync(filePath, "utf8");
    } catch { continue; }
    loc += content.split("\n").length;
    todoFixmeCount += (content.match(TODO_FIXME_RE) ?? []).length;
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
    for (const f of readdirSync(ghWorkflows)) {
      if (f.endsWith(".yml") || f.endsWith(".yaml")) {
        ciConfigs.push(`.github/workflows/${f}`);
      }
    }
  }

  for (const filePath of walk(repoPath)) {
    if (!SCANNABLE_SOURCE_EXTS.has(extname(filePath))) continue;
    let content = "";
    try {
      content = readFileSync(filePath, "utf8");
    } catch { continue; }
    for (const match of content.matchAll(ENV_VAR_RE)) {
      const envVarName = match[1];
      if (INFRA_SUFFIX_RE.test(envVarName)) {
        envVarsReferenced.add(envVarName);
      }
    }
  }

  return {
    envVarsReferenced: [...envVarsReferenced].sort(),
    dockerfilePresent,
    ciConfigs,
  };
}

function scanGit(repoPath: string): GitInfo {
  const dotGit = join(repoPath, ".git");
  if (!existsSync(dotGit)) {
    return { isGitRepo: false };
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
    const requireBlock = content.match(GO_MOD_REQUIRE_BLOCK_RE);
    const lines = requireBlock
      ? requireBlock[1].trim().split("\n")
      : content.split("\n").filter((line) => line.trim().startsWith("require "));
    const deps = lines
      .map((line) => line.replace(GO_MOD_REQUIRE_LINE_PREFIX_RE, "").trim().split(/\s+/)[0])
      .filter((dep) => dep && !dep.startsWith("//"));
    return { type, deps };
  }
  return { type };
}

function scanManifests(repoPath: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  const files = readdirSync(repoPath);

  for (const file of files) {
    if (!MANIFEST_FILES.includes(file)) continue;
    const fullPath = join(repoPath, file);
    try {
      entries.push(parseManifest(file, readFileSync(fullPath, "utf8")));
    } catch (err) {
      entries.push({ type: file, error: `${fullPath}: ${(err as Error).message}` });
    }
  }

  return entries;
}

function scanLanguages(repoPath: string): Record<string, number> {
  const locByLang: Record<string, number> = {};

  for (const filePath of walk(repoPath)) {
    const dotIdx = filePath.lastIndexOf(".");
    // skip dot-files (.gitkeep, .gitignore) and files with no extension
    if (dotIdx === -1 || filePath[dotIdx - 1] === "/" || filePath[dotIdx - 1] === undefined) continue;
    const ext = filePath.slice(dotIdx);
    const lang = LANGUAGE_BY_EXT[ext] ?? "other";
    let content = "";
    try {
      content = readFileSync(filePath, "utf8");
    } catch { continue; }
    locByLang[lang] = (locByLang[lang] ?? 0) + content.split("\n").length;
  }

  const totalLoc = Object.values(locByLang).reduce((sum, loc) => sum + loc, 0);
  if (totalLoc === 0) return {};

  const fractions = Object.entries(locByLang)
    .map(([lang, loc]) => [lang, Math.round((loc / totalLoc) * 100) / 100] as [string, number])
    .sort(([, aFraction], [, bFraction]) => bFraction - aFraction);

  return Object.fromEntries(fractions);
}

export async function repoStats(path: string): Promise<RepoStats> {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`path not readable or not a directory: ${path}`);
  }

  return {
    name: basename(resolve(path)),
    path: resolve(path),
    git: scanGit(path),
    languages: scanLanguages(path),
    manifests: scanManifests(path),
    metrics: scanMetrics(path),
    integrations: scanIntegrations(path),
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const repoIdx = args.indexOf("--repo");
  if (repoIdx === -1 || !args[repoIdx + 1]) {
    console.error("usage: bun run repo-stats.ts --repo <path>");
    process.exit(1);
  }
  repoStats(args[repoIdx + 1])
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
