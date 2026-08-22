// The repository root, the telemetry switch, and where a session's record lives. The
// switch is `.aidd/config.json`'s `telemetry.enabled`, read fresh at every call.

const fs = require("node:fs");
const os = require("node:os");
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
// world-readable. Windows accepts this mode on mkdirSync/appendFileSync/chmodSync
// without error, but does nothing with it - the directory and every file in it land at
// 0666 regardless (measured on a real windows-latest runner, #707). Privacy there comes
// from restrictToCurrentUser below, not from this constant.
const PRIVATE_DIR_MODE = 0o700;

// `mkdirSync`'s `mode` applies only to a directory it creates, so a checked-out
// `aidd_docs/runs/` needs this chmod. Never applied to a user-named AIDD_RUNS_DIR - a
// user who names their own runs directory keeps responsibility for its permissions.
function tightenOwnedDir(dir) {
  if (process.env.AIDD_RUNS_DIR) return;
  if (process.platform === "win32") return restrictToCurrentUser(dir, { recursive: true });
  try {
    fs.chmodSync(dir, PRIVATE_DIR_MODE);
  } catch {
    // Foreign owner, read-only mount: leave it as it is.
  }
}

// POSIX needs no second pass: `appendFileSync`'s own `mode` already set 0600 at the
// moment it created the file. On Windows, measured on a real windows-latest runner
// (#707), `tightenOwnedDir`'s `/T` recursion does not reliably carry the current-user
// grant onto a leaf file it walks into - the file came back with zero ACEs of its own,
// readable only because the runner's account happened to hold enough privilege to
// override that. This restricts the file directly instead of trusting `/T` to reach it.
function tightenOwnedFile(filePath) {
  if (process.env.AIDD_RUNS_DIR) return;
  if (process.platform === "win32") restrictToCurrentUser(filePath, { recursive: false });
}

// The real mechanism on Windows: reset the target's NTFS ACL to inherit nothing and grant
// Full Control to the current user alone. `recursive` adds `/T` plus the container-inherit
// flags `(OI)(CI)` so a directory's own future children pick up the same grant; a file
// gets neither, since a file has no children to inherit anything. `icacls` shelled out to
// the same way `git` already is above; `/C` keeps it going past one bad entry instead of
// aborting the whole reset, and its own exit code is not trusted as proof of anything -
// only a caller reading the ACL back can say whether it worked.
function restrictToCurrentUser(target, { recursive = false } = {}) {
  try {
    const owner = process.env.USERDOMAIN
      ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
      : process.env.USERNAME || os.userInfo().username;
    if (!owner) return;
    const grant = recursive ? `${owner}:(OI)(CI)F` : `${owner}:F`;
    const args = [target, "/inheritance:r", "/grant:r", grant];
    if (recursive) args.push("/T");
    args.push("/C", "/Q");
    spawnSync("icacls", args, { encoding: "utf8" });
  } catch {
    // icacls missing, no resolvable owner, or a domain-policy refusal: leave it as it is.
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
  tightenOwnedFile,
  resolveRunsDir,
  resolveWriteTarget,
};
