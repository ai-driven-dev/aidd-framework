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
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      env: gitEnv(),
    });
    if (result.status !== 0) return null;
    const root = result.stdout.trim();
    return root || null;
  } catch {
    return null;
  }
}

// Where a linked worktree's git directory always sits: `<git-common-dir>/worktrees/<name>`.
const WORKTREES_SEGMENT = "worktrees";
const GIT_DIR_NAME = ".git";

// Taken from git, never from an agent runner's own variable, which names that runner's
// concept rather than the repository's.
//
// A plain checkout gets NEITHER field: absent, never null and never "" - an empty string
// would gather every plain checkout into one group as though they were the same worktree.
//
// The layout is the test, never a comparison of the two directories: two spellings of one
// path would compare unequal and write a worktree field on a plain checkout. `path.resolve`
// comes first because `git rev-parse` prints these relative for a plain checkout.
function worktreeFields(cwd, commonDir, gitDir) {
  if (!commonDir || !gitDir) return {};
  const resolvedGitDir = path.resolve(cwd, gitDir);
  // A plain checkout's git directory is the literal `.git`, so a repository living in a
  // directory named `worktrees` would otherwise pass the layout test below. A linked
  // worktree's git directory is named for the worktree and is never `.git`.
  if (path.basename(resolvedGitDir) === GIT_DIR_NAME) return {};
  if (path.basename(path.dirname(resolvedGitDir)) !== WORKTREES_SEGMENT) return {};
  const repoName = repositoryNameFromCommonDir(path.resolve(cwd, commonDir));
  return {
    worktreeId: sanitizePathSegment(path.basename(resolvedGitDir)),
    ...(repoName === null ? {} : { worktreeRepoId: repoName }),
  };
}

// `<repo>/.git` and a bare `<repo>.git` both answer `<repo>`. Recorded beside the worktree
// rather than left to `project_id`, which falls back to the worktree's own directory name
// when a clone has no remote - so two worktrees of one clone would look unrelated.
function repositoryNameFromCommonDir(commonDir) {
  const base = path.basename(commonDir);
  const name =
    base === GIT_DIR_NAME ? path.basename(path.dirname(commonDir)) : base.replace(/\.git$/u, "");
  return name === "" || name === "." || name === ".." ? null : sanitizePathSegment(name);
}

// One `git rev-parse` in the ordinary case, and never more than two. `--git-path hooks`
// honours `core.hooksPath`, which joining `.git/hooks` by hand does not, but `rev-parse`
// fails atomically: a git that does not understand one option answers non-zero for all of
// them, and a null here makes the journal write nothing at all. So the four-option form is
// asked first, and an older git pays a second call and goes without the hooks directory.
function getRepoLocation(cwd) {
  if (typeof cwd !== "string" || !cwd) return null;
  try {
    const withHooks = revParse(cwd, [...LOCATION_OPTIONS, "--git-path", "hooks"]);
    const parts = withHooks ?? revParse(cwd, LOCATION_OPTIONS);
    if (!parts) return null;
    const [root, commonDir, gitDir, hooksDir] = parts;
    if (!root) return null;
    return {
      repoRoot: root,
      // Carried so the trailer repair can tell a hooks directory inside the git directory
      // from one inside the working tree, which is version-controlled content.
      ...(commonDir ? { gitDir: path.resolve(cwd, commonDir) } : {}),
      ...worktreeFields(cwd, commonDir, gitDir),
      // Against `cwd`, never against the repository root: `git rev-parse` prints this
      // relative to the directory it ran in, so resolving against the root sends a session
      // started in `sub/deep` two levels above the checkout, which is where repair writes.
      ...(hooksDir ? { hooksDir: path.resolve(cwd, hooksDir) } : {}),
    };
  } catch {
    return null;
  }
}

const LOCATION_OPTIONS = ["--show-toplevel", "--git-common-dir", "--git-dir"];

/** `null` when `rev-parse` refused. A git too old for one option refuses all of them, which
 * is why the caller falls back to a shorter form rather than a shorter reading of this. */
function revParse(cwd, options) {
  const result = spawnSync("git", ["rev-parse", ...options], {
    cwd,
    encoding: "utf8",
    env: gitEnv(),
  });
  if (result.status !== 0) return null;
  return String(result.stdout)
    .split("\n")
    .map((part) => part.trim());
}

// hooks/ is copied verbatim with no install step, so JSON.parse is the only parser here.
function readTelemetryConfig(repoRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, ".aidd", "config.json"), "utf8"));
  } catch {
    return null;
  }
}

// The only refusal at a person's own scope, and a variable rather than a second config file:
// it is refusable per shell, per session and per machine, and needs nothing created.
//
// Only the literal "0" is a refusal - unset or empty is not a choice this can express, and it
// never turns measurement on by itself. The CLI's own `personRefusesTelemetry` mirrors this
// exactly, so the two can never disagree about whether a person has refused.
const TELEMETRY_REFUSAL_VARIABLE = "AIDD_TELEMETRY";

function personRefusesTelemetry() {
  return process.env[TELEMETRY_REFUSAL_VARIABLE] === "0";
}

// Strict `=== true`, not truthy: a half-written config must read as off. The person's refusal
// is read first and wins unconditionally - no project out-ranks the person running it.
function telemetryEnabled(repoRoot) {
  if (personRefusesTelemetry()) return false;
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
  return projectId.split("/").filter(Boolean).map(sanitizePathSegment).join("/");
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

// What this hook writes is who-worked-on-what-for-how-long, so it is not left world-readable.
// Windows accepts this mode without error and does nothing with it - everything lands at 0666
// regardless - so privacy there comes from restrictToCurrentUser below instead.
const PRIVATE_DIR_MODE = 0o700;

// `mkdirSync`'s `mode` applies only to a directory it creates, so a checked-out runs
// directory needs this chmod - and on Windows needs it reset on every write, since anything
// could have widened it since. Never on a user-named AIDD_RUNS_DIR: that is theirs to set.
function tightenOwnedDir(dir) {
  if (process.env.AIDD_RUNS_DIR) return;
  if (process.platform === "win32") return restrictToCurrentUser(dir, { inheritable: true });
  try {
    fs.chmodSync(dir, PRIVATE_DIR_MODE);
  } catch {
    // Foreign owner, read-only mount: leave it as it is.
  }
}

// POSIX needs no second pass: `appendFileSync`'s own `mode` set 0600 as it created the file.
function tightenOwnedFile(filePath) {
  if (process.env.AIDD_RUNS_DIR) return;
  if (process.platform === "win32") restrictToCurrentUser(filePath);
}

// The real mechanism on Windows: reset the target's NTFS ACL to inherit nothing and grant
// Full Control to the current user alone. `inheritable` adds `(OI)(CI)` so a directory's
// future children pick up the grant; a file has no children to inherit anything.
//
// Never `/T`: it walks into files this code does not own and can leave one with no usable
// ACE, so an ordinary `git add -A` then fails with "Permission denied". `/C` keeps icacls
// going past one bad entry, and its exit code is not trusted as proof of anything.
function restrictToCurrentUser(target, { inheritable = false } = {}) {
  try {
    const owner = process.env.USERDOMAIN
      ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
      : process.env.USERNAME || os.userInfo().username;
    if (!owner) return;
    const grant = inheritable ? `${owner}:(OI)(CI)F` : `${owner}:F`;
    const args = [target, "/inheritance:r", "/grant:r", grant, "/C", "/Q"];
    spawnSync("icacls", args, { encoding: "utf8" });
  } catch {
    // icacls missing, no resolvable owner, or a domain-policy refusal: leave it as it is.
  }
}

// A decision, not an inherited default: a worktree keeps its own journal, at the worktree's
// own root and never at `--git-common-dir`'s shared repository.
//
// A bare clone plus worktrees has no main working tree to write into at all, and even where
// one exists, writing into it from another worktree dirties a checkout on a different branch
// whose `.gitignore` was never asked to carry the entry. Cross-worktree joining is served by
// `worktreeFields` naming the worktree on `session_start` instead.
function resolveRunsDir(cwd) {
  const location = getRepoLocation(cwd);
  if (!location || !telemetryEnabled(location.repoRoot)) return null;
  return { ...location, dir: runsDir(location.repoRoot) };
}

// A token-authenticated clone leaves a live credential in the remote's userinfo, and the
// journal is meant to be read and shipped. Only a scheme-bearing URL has userinfo.
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
  getRepoLocation,
  readTelemetryConfig,
  telemetryEnabled,
  personRefusesTelemetry,
  TELEMETRY_REFUSAL_VARIABLE,
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
