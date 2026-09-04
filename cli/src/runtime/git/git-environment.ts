/**
 * git exports GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE and friends into every process it
 * spawns. Left in place, a `git` call made from inside a git hook or a CI step reads the
 * repository the environment names instead of the one at `cwd` — silently, and with a
 * plausible wrong answer rather than an error.
 */
export function environmentWithoutGitVariables(
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("GIT_")));
}
