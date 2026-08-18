// repo.js - the repository root, the telemetry switch, and where a
// session's record lives. The switch is `.aidd/config.json`'s
// `telemetry.enabled`, read fresh at every call - never cached across a
// session. `aidd_docs/runs/` existing is no longer a permission, only the
// location the switch, once on, writes to (see aidd_docs/runs/README.md).

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

// Zero-dependency by requirement: `aidd framework build` copies hooks/
// verbatim with no install step, so JSON.parse is the only parser available.
// Unreadable, unparseable, or absent -> null, same failure direction as
// everywhere else in this layer.
function readTelemetryConfig(repoRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, ".aidd", "config.json"), "utf8"));
  } catch {
    return null;
  }
}

// The entire switch. Strict `=== true`, not merely truthy: a config a tool
// half-wrote (a string, a 1, a null telemetry key) must read as off, not on.
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

//   SSH:   git@github.com:owner/repo.git       -> owner/repo
//   HTTPS: https://github.com/owner/repo.git   -> owner/repo
//
// A GitLab-style subgroup path (group/subgroup/repo) collapses to its last
// two segments.
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

// Never bare "." or ".." - either would walk the filesystem tree instead of
// naming something inside it.
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

function deriveProjectId(repoRoot) {
  const remoteUrl = getRemoteUrl(repoRoot);
  const ownerRepo = remoteUrl ? parseOwnerRepoFromRemote(remoteUrl) : null;
  const raw = ownerRepo || path.basename(repoRoot);
  return sanitizeProjectId(raw);
}

// `AIDD_RUNS_DIR` overrides outright; otherwise the default location the
// switch, once on, writes to - not itself a second gate.
function runsDir(repoRoot) {
  return process.env.AIDD_RUNS_DIR || path.join(repoRoot, "aidd_docs", "runs");
}

// Directories and files this hook creates hold who-worked-on-what-and-for-
// how-long, so they are not left world-readable at the OS default. Windows
// ignores POSIX modes rather than erroring on them.
const PRIVATE_DIR_MODE = 0o700;

// `aidd_docs/runs/` arrives from a git checkout, and `mkdirSync`'s `mode`
// applies only to a directory it creates - this chmod is what actually holds
// 0700 on it. Deliberately not applied to a user-named AIDD_RUNS_DIR: that
// directory belongs to whoever named it.
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

function resolveWriteTarget(cwd) {
  const target = resolveRunsDir(cwd);
  if (!target) return null;
  return { ...target, projectId: deriveProjectId(target.repoRoot) };
}

module.exports = {
  getRepoRoot,
  readTelemetryConfig,
  telemetryEnabled,
  getRemoteUrl,
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
