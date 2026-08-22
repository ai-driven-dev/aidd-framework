// The repository root, the telemetry switch, and where a session's record lives. The
// switch is `.aidd/config.json`'s `telemetry.enabled`, read fresh at every call.

const fs = require("node:fs");
const path = require("node:path");
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

function getRepoRoot(cwd) {
  if (typeof cwd !== "string" || !cwd) return null;
  try {
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", env: gitEnv() });
    if (result.status !== 0) return null;
    const root = result.stdout.trim();
    return root || null;
  } catch {
    return null;
  }
}

// `aidd framework build` copies hooks/ verbatim with no install step, so JSON.parse is
// the only parser available.
function readTelemetryConfig(repoRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, ".aidd", "config.json"), "utf8"));
  } catch {
    return null;
  }
}

// Strict `=== true`, not truthy: a half-written config must read as off, not on.
function telemetryEnabled(repoRoot) {
  const config = readTelemetryConfig(repoRoot);
  return Boolean(config && config.telemetry && config.telemetry.enabled === true);
}

function getRemoteUrl(repoRoot) {
  try {
    const result = spawnSync("git", ["remote", "get-url", "origin"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: gitEnv(),
    });
    if (result.status !== 0) return null;
    const url = result.stdout.trim();
    return url || null;
  } catch {
    return null;
  }
}

//   git@github.com:owner/repo.git      -> owner/repo
//   https://github.com/owner/repo.git   -> owner/repo
// A GitLab subgroup path collapses to its last two segments.
function parseOwnerRepoFromRemote(remoteUrl) {
  if (typeof remoteUrl !== "string") return null;
  const trimmed = remoteUrl.trim().replace(/\.git$/u, "");
  if (!trimmed) return null;

  const sshMatch = trimmed.match(/^[^@\s/]+@[^:\s/]+:(.+)$/u);
  const urlMatch = trimmed.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:[^/@\s]+@)?[^/\s]+\/(.+)$/u);
  const captured = sshMatch ? sshMatch[1] : urlMatch ? urlMatch[1] : null;
  if (!captured) return null;

  const segments = captured.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  return segments.slice(-2).join("/");
}

// Never bare "." or ".." - either walks the tree instead of naming something in it.
function sanitizePathSegment(segment) {
  const cleaned = String(segment).replace(/[^\w.-]/gu, "-");
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "-" : cleaned;
}

function sanitizeProjectId(projectId) {
  return projectId
    .split("/")
    .filter(Boolean)
    .map(sanitizePathSegment)
    .join("/");
}

// Split from deriveProjectId so a caller holding remoteUrl pays one git shellout, not two.
function projectIdFromRemote(repoRoot, remoteUrl) {
  const ownerRepo = remoteUrl ? parseOwnerRepoFromRemote(remoteUrl) : null;
  const raw = ownerRepo || path.basename(repoRoot);
  return sanitizeProjectId(raw);
}

// The CLI duplicates this algorithm in telemetry-project-id.ts and a test proves the two
// agree, so the signature is not this plugin's alone to change.
function deriveProjectId(repoRoot) {
  return projectIdFromRemote(repoRoot, getRemoteUrl(repoRoot));
}

// `AIDD_RUNS_DIR` overrides outright. The directory existing is not a second gate.
function runsDir(repoRoot) {
  return process.env.AIDD_RUNS_DIR || path.join(repoRoot, "aidd_docs", "runs");
}

// What this hook writes is who-worked-on-what-for-how-long, so it is not left
// world-readable. Windows ignores POSIX modes rather than erroring on them.
const PRIVATE_DIR_MODE = 0o700;

// `mkdirSync`'s `mode` applies only to a directory it creates, so a checked-out
// `aidd_docs/runs/` needs this chmod. Never applied to a user-named AIDD_RUNS_DIR.
function tightenOwnedDir(dir) {
  if (process.env.AIDD_RUNS_DIR) return;
  try {
    fs.chmodSync(dir, PRIVATE_DIR_MODE);
  } catch {
    // Foreign owner, read-only mount, Windows: leave it as it is.
  }
}

// Decision, not an inherited default (#693): a worktree keeps its own journal.
// `getRepoRoot` resolves `--show-toplevel`, the worktree's own root - never
// `--git-common-dir`'s shared repository, which this deliberately does not read.
//
// Two reasons hold it there. First, the layout an agent runner actually gives each agent
// - Orca sets ORCA_WORKTREE_ID and does exactly this - is a bare clone plus worktrees,
// which has no main working tree to write into at all: `--git-common-dir` there names the
// bare `.git`, whose parent is not a checkout. Second, even where a main worktree does
// exist, writing into it from worktree B would dirty a checkout on a different branch,
// possibly with uncommitted work of its own, whose `.gitignore` was never asked to carry
// the entry `telemetry-switch.js on` added when B turned measurement on.
//
// Cross-worktree joining - so a report can still see every worktree's sessions together -
// is #695, a field recorded on `session_start`, not a shared write target.
function resolveRunsDir(cwd) {
  const repoRoot = getRepoRoot(cwd);
  if (!repoRoot || !telemetryEnabled(repoRoot)) return null;
  return { repoRoot, dir: runsDir(repoRoot) };
}

// A token-authenticated clone leaves a live credential in the remote's userinfo
// (`https://ghp_xxx@host/o/r`), and the journal is meant to be read and shipped. Only
// scheme-bearing URLs have userinfo; scp-style `git@host:owner/repo` is left whole.
function remoteWithoutCredentials(remoteUrl) {
  if (typeof remoteUrl !== "string") return null;
  return remoteUrl.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/]*@/u, "$1");
}

// project_remote sits beside project_id so a changed remote can be re-derived instead of
// silently splitting a project in two.
function resolveWriteTarget(cwd) {
  const target = resolveRunsDir(cwd);
  if (!target) return null;
  const remoteUrl = getRemoteUrl(target.repoRoot);
  const projectId = projectIdFromRemote(target.repoRoot, remoteUrl);
  return { ...target, projectId, projectRemote: remoteWithoutCredentials(remoteUrl) };
}

module.exports = {
  getRepoRoot,
  readTelemetryConfig,
  telemetryEnabled,
  getRemoteUrl,
  remoteWithoutCredentials,
  parseOwnerRepoFromRemote,
  sanitizePathSegment,
  sanitizeProjectId,
  deriveProjectId,
  runsDir,
  PRIVATE_DIR_MODE,
  tightenOwnedDir,
  resolveRunsDir,
  resolveWriteTarget,
};
