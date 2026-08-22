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

// The first workspace_roots entry getRepoRoot actually resolves - a multi-root workspace
// carries several entries and only some of them are git repositories, so index zero is not
// safe to assume.
function firstGitWorkspaceRoot(workspaceRoots) {
  if (!Array.isArray(workspaceRoots)) return undefined;
  for (const root of workspaceRoots) {
    if (typeof root === "string" && root && getRepoRoot(root)) return root;
  }
  return undefined;
}

// How each host names its working directory in its own hook payload. Every host but
// Cursor delivers cwd directly; Cursor delivers workspace_roots instead (see
// fixtures/README.md) and never cwd at all. OpenCode is not a stdin hook - its own plugin
// module builds this payload itself, from the session's own `directory` (session_start) or
// the plugin's own init-time directory (turn_end, see hooks/opencode-plugin.js) - but reads
// through the same `cwd` key as every stdin host so the shape stays one shape.
const CWD_READER_BY_HOST = Object.freeze({
  "claude-code": (payload) => payload.cwd,
  codex: (payload) => payload.cwd,
  copilot: (payload) => payload.cwd,
  cursor: (payload) => firstGitWorkspaceRoot(payload.workspace_roots),
  opencode: (payload) => payload.cwd,
});

function readCwd(host, payload) {
  const reader = CWD_READER_BY_HOST[host];
  return reader ? reader(payload) : undefined;
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
  CWD_READER_BY_HOST,
  readCwd,
};
