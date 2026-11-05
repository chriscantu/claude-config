import { readlinkSync } from "node:fs";
import { join } from "node:path";

export class EvalConfigError extends Error {}

/**
 * Child-env override that points `claude` at the eval config folder.
 * The folder must link back to this checkout, otherwise evals would silently
 * test some other copy of the config. CI has no eval folder and opts out with
 * EVAL_ALLOW_DEFAULT_CONFIG=1.
 */
export function evalConfigEnv(
  env: NodeJS.ProcessEnv,
  home: string,
  repoDir: string,
): { CLAUDE_CONFIG_DIR?: string } {
  if (env.EVAL_ALLOW_DEFAULT_CONFIG === "1") return {};

  const dir = env.CLAUDE_EVAL_HOME ?? join(home, ".claude-eval");
  const expected = join(repoDir, "global", "CLAUDE.md");
  let actual: string;
  try {
    actual = readlinkSync(join(dir, "CLAUDE.md"));
  } catch {
    throw new EvalConfigError(`Eval config folder ${dir} is missing or not set up. Run: fish bin/setup-eval-home.fish`);
  }
  if (actual !== expected) {
    throw new EvalConfigError(
      `Eval config folder ${dir} links CLAUDE.md to ${actual}, not this checkout (${expected}). Run: fish bin/setup-eval-home.fish`,
    );
  }
  return { CLAUDE_CONFIG_DIR: dir };
}
