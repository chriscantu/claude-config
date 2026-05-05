import { spawnSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { basename, join } from "path";

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

const SKIP_DIRS = new Set([
  "node_modules", "vendor", ".git", "dist", "build", ".next", "target", "__pycache__",
]);

const TEST_DIR_NAMES = new Set(["tests", "test", "__tests__", "spec"]);

const ENV_VAR_RE = /\b([A-Z][A-Z0-9_]{2,})\b/g;
const INFRA_SUFFIX_RE = /_(?:URL|KEY|TOKEN|SECRET|DSN|HOST|PORT|API)$/;

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
  for (const entry of readdirSync(current)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(current, entry);
    const st = statSync(full);
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
    if (/(?:^|\/)(?:.*\.test\.|.*_test\.)/.test(filePath)) testFileCount++;
    let content = "";
    try {
      content = readFileSync(filePath, "utf8");
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
    for (const f of readdirSync(ghWorkflows)) {
      if (f.endsWith(".yml") || f.endsWith(".yaml")) {
        ciConfigs.push(`.github/workflows/${f}`);
      }
    }
  }

  for (const filePath of walk(repoPath)) {
    if (!/\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|env)$/.test(filePath)) continue;
    let content = "";
    try {
      content = readFileSync(filePath, "utf8");
    } catch { continue; }
    for (const match of content.matchAll(ENV_VAR_RE)) {
      const v = match[1];
      if (INFRA_SUFFIX_RE.test(v)) {
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

  const totalLoc = Object.values(locByLang).reduce((a, b) => a + b, 0);
  if (totalLoc === 0) return {};

  const fractions = Object.entries(locByLang)
    .map(([lang, loc]) => [lang, Math.round((loc / totalLoc) * 100) / 100] as [string, number])
    .sort((a, b) => b[1] - a[1]);

  return Object.fromEntries(fractions);
}

export async function repoStats(path: string): Promise<RepoStats> {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`path not readable or not a directory: ${path}`);
  }

  return {
    name: basename(path),
    path,
    git: scanGit(path),
    languages: scanLanguages(path),
    manifests: scanManifests(path),
    metrics: scanMetrics(path),
    integrations: scanIntegrations(path),
    errors: [],
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
