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

export async function repoStats(path: string): Promise<RepoStats> {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`path not readable or not a directory: ${path}`);
  }

  return {
    name: basename(path),
    path,
    git: scanGit(path),
    languages: {},
    manifests: scanManifests(path),
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
