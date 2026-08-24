// Whether the working directory is inside a git repository, read the way the hook itself
// reads it: `git rev-parse --show-toplevel` from hooks/lib/repo.js's getRepoRoot, copied
// rather than required - see switch.js for why a require across the skill/hooks boundary
// is not made here. The journal writes nowhere without a repository, so this is what tells
// the diagnostic apart from a hook that fired and simply left no trace.

const { spawnSync } = require("node:child_process");

// git exports GIT_DIR and friends into every process it spawns, so a session started
// from inside a git hook would resolve someone else's repository instead of its own.
function gitEnv() {
  const env = {};
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith("GIT_")) env[key] = process.env[key];
  }
  return env;
}

function isGitRepo(cwd) {
  try {
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", env: gitEnv() });
    return result.status === 0 && result.stdout.trim() !== "";
  } catch {
    return false;
  }
}

module.exports = { isGitRepo };
