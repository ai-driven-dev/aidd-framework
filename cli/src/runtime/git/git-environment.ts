/** git exports `GIT_DIR`, `GIT_WORK_TREE` and friends into every process it spawns. Left in
 * place, a `git` call from inside a hook or a CI step reads the repository the environment
 * names rather than the one at `cwd` — silently, with a plausible wrong answer. */
export function environmentWithoutGitVariables(
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("GIT_")));
}
