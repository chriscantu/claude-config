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
