// repo.js - the repository root, the opt-in gate, and where a session's
// record lives: aidd_docs/runs/ inside the repository, the same directory
// whose presence is the opt-in gate itself.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function getRepoRoot(cwd) {
  if (typeof cwd !== "string" || !cwd) return null;
  try {
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
    if (result.status !== 0) return null;
    const root = result.stdout.trim();
    return root || null;
  } catch {
    return null;
  }
}

// The entire opt-in mechanism.
function optedIn(repoRoot) {
  try {
    return fs.statSync(path.join(repoRoot, "aidd_docs", "runs")).isDirectory();
  } catch {
    return false;
  }
}

function getRemoteUrl(repoRoot) {
  try {
    const result = spawnSync("git", ["remote", "get-url", "origin"], { cwd: repoRoot, encoding: "utf8" });
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

// `AIDD_RUNS_DIR` overrides outright; otherwise the same directory `optedIn`
// already gates on, so the store and the gate are one directory, not two
// that can drift apart.
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
  if (!repoRoot || !optedIn(repoRoot)) return null;
  return { repoRoot, dir: runsDir(repoRoot) };
}

function resolveWriteTarget(cwd) {
  const target = resolveRunsDir(cwd);
  if (!target) return null;
  return { ...target, projectId: deriveProjectId(target.repoRoot) };
}

module.exports = {
  getRepoRoot,
  optedIn,
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
