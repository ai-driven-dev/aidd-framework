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

// The worktree a session ran in, named so two worktrees of one repository can be
// told apart in a journal - taken from git, never from an agent runner's own variable,
// which names that runner's concept rather than the repository's.
//
// A plain checkout gets NEITHER field: absent, never null and never "". An absent value is
// the only one a reader cannot mistake for a worktree that happens to be called something;
// an empty string would gather every plain checkout on earth into one group as though they
// were the same worktree. That is the error `record-stated-rows.ts`'s `NO_KNOWN_PROJECT` symbol
// exists to prevent for a record naming no project, and it is prevented here the same way -
// by the field not being there at all.
//
// The layout is the test, never a comparison of the two directories: two spellings of one
// path (a Windows drive letter cased differently in each) would compare unequal and write
// a worktree field on a plain checkout. `path.basename` reads "/" and "\" alike on Windows,
// and `path.resolve` is applied first because `git rev-parse` prints these two relative to
// the cwd it ran in for a plain checkout and absolute for a linked worktree.
function worktreeFields(cwd, commonDir, gitDir) {
  if (!commonDir || !gitDir) return {};
  const resolvedGitDir = path.resolve(cwd, gitDir);
  // A plain checkout's git directory is always the literal `.git` inside the working tree,
  // whatever that tree is called - so a repository that happens to live in a directory
  // named `worktrees` would otherwise pass the layout test below and be recorded as a
  // worktree named ".git". The linked worktree's git directory is named for the worktree
  // and is never `.git`.
  if (path.basename(resolvedGitDir) === GIT_DIR_NAME) return {};
  if (path.basename(path.dirname(resolvedGitDir)) !== WORKTREES_SEGMENT) return {};
  const repoName = repositoryNameFromCommonDir(path.resolve(cwd, commonDir));
  return {
    worktreeId: sanitizePathSegment(path.basename(resolvedGitDir)),
    ...(repoName === null ? {} : { worktreeRepoId: repoName }),
  };
}

// The repository every worktree of one clone shares, named from the directory that holds
// it: `<repo>/.git` and a bare `<repo>.git` both answer `<repo>`. Recorded beside the
// worktree rather than left to `project_id`, which falls back to the *worktree's* own
// directory name when a clone has no remote - so two worktrees of a remote-less clone
// carry two different `project_id` values and nothing else on the line would say they
// belong together.
function repositoryNameFromCommonDir(commonDir) {
  const base = path.basename(commonDir);
  const name =
    base === GIT_DIR_NAME ? path.basename(path.dirname(commonDir)) : base.replace(/\.git$/u, "");
  return name === "" || name === "." || name === ".." ? null : sanitizePathSegment(name);
}

// One `git rev-parse` in the ordinary case, and never more than two.
//
// The fourth option, `--git-path hooks`, is what finds the directory git will actually run a
// hook from: it honours `core.hooksPath`, which joining `.git/hooks` by hand does not, and
// from a linked worktree it answers the common hooks directory, which is where git looks.
//
// It cannot simply be added to the list, and that is a measured constraint rather than a
// stylistic one. `rev-parse` fails atomically — a git that does not understand one option
// answers non-zero for all of them — and this call returning null makes `resolveWriteTarget`
// return null, which makes the journal write nothing at all. Against a git stubbed to reject
// `--git-path`, the hook exited 0 and recorded no session. So the four-option form is asked
// first and the three-option form is the fallback: every git pays one call, and only one too
// old to answer the fourth pays a second and simply goes without the hooks directory.
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
      // from one `core.hooksPath` points at inside the working tree - the second being
      // version-controlled content nothing here writes to unasked.
      ...(commonDir ? { gitDir: path.resolve(cwd, commonDir) } : {}),
      ...worktreeFields(cwd, commonDir, gitDir),
      // Resolved against `cwd`, never against the repository root: `git rev-parse` prints
      // this relative to the directory it ran in, exactly as `worktreeFields` above says of
      // its own two outputs. Resolving against the root instead sent a session started in
      // `sub/deep` two levels ABOVE the repository - measured, `../../.git/hooks` became a
      // path outside the checkout entirely, which is where the repair then wrote.
      ...(hooksDir ? { hooksDir: path.resolve(cwd, hooksDir) } : {}),
    };
  } catch {
    return null;
  }
}

const LOCATION_OPTIONS = ["--show-toplevel", "--git-common-dir", "--git-dir"];

/** The trimmed words `rev-parse` printed, or `null` when it refused. A git too old for one
 * of the options refuses all of them, which is why the caller has a shorter form to fall
 * back to rather than a shorter reading of this one. */
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

// `aidd framework build` copies hooks/ verbatim with no install step, so JSON.parse is
// the only parser available.
function readTelemetryConfig(repoRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, ".aidd", "config.json"), "utf8"));
  } catch {
    return null;
  }
}

// The only refusal available at a person's own scope. Not a second config file: state for
// "is this measured" already lives in .aidd/config.json (the project's tracked decision),
// and a file at the person's scope would be a third place the same fact could live, in a
// change whose point is that there are too many already. An environment variable is
// refusable per shell, per session and per machine, and needs nothing to be created.
//
// Only the literal string "0" counts as a refusal. Unset or empty is not a choice this
// variable can express - it never turns measurement on by itself, and it never overrides an
// enabled project. `cli/src/contexts/telemetry/domain/telemetry-switch.ts`'s
// `personRefusesTelemetry` mirrors this exactly, so the hook and the CLI can never disagree
// about whether a person has refused.
const TELEMETRY_REFUSAL_VARIABLE = "AIDD_TELEMETRY";

function personRefusesTelemetry() {
  return process.env[TELEMETRY_REFUSAL_VARIABLE] === "0";
}

// Strict `=== true`, not truthy: a half-written config must read as off, not on. The
// person's own refusal is read before the project's file, and wins over it unconditionally -
// a project that turns measurement on can never out-rank the person running it.
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

// What this hook writes is who-worked-on-what-for-how-long, so it is not left
// world-readable. Windows accepts this mode on mkdirSync/appendFileSync/chmodSync
// without error, but does nothing with it - the directory and every file in it land at
// 0666 regardless (measured on a real windows-latest runner). Privacy there comes
// from restrictToCurrentUser below, not from this constant.
const PRIVATE_DIR_MODE = 0o700;

// `mkdirSync`'s `mode` applies only to a directory it creates, so a checked-out
// `aidd_docs/runs/` needs this chmod - and, on Windows, needs it reset again on every
// write, since anything (a checkout, an admin, another tool) could have widened it since
// the last one. Never applied to a user-named AIDD_RUNS_DIR - a user who names their own
// runs directory keeps responsibility for its permissions.
function tightenOwnedDir(dir) {
  if (process.env.AIDD_RUNS_DIR) return;
  if (process.platform === "win32") return restrictToCurrentUser(dir, { inheritable: true });
  try {
    fs.chmodSync(dir, PRIVATE_DIR_MODE);
  } catch {
    // Foreign owner, read-only mount: leave it as it is.
  }
}

// POSIX needs no second pass: `appendFileSync`'s own `mode` already set 0600 at the
// moment it created the file. On Windows this is the direct, non-recursive reset every
// file this code writes gets on its own.
function tightenOwnedFile(filePath) {
  if (process.env.AIDD_RUNS_DIR) return;
  if (process.platform === "win32") restrictToCurrentUser(filePath);
}

// The real mechanism on Windows: reset the target's NTFS ACL to inherit nothing and grant
// Full Control to the current user alone. `inheritable` adds the container-inherit flags
// `(OI)(CI)` so a directory's own future children pick up the same grant; a file gets
// neither, since a file has no children to inherit anything. Never `/T`: measured on a
// real windows-latest runner, `/T` walked into files this code does not own - a
// checked-out `.gitkeep` among them - and left at least one with no usable ACE of its
// own, so an ordinary `git add -A` right after got "Permission denied" opening it. It
// bought nothing here anyway: a file this code creates gets its own tightenOwnedFile
// pass, and `(OI)(CI)` alone makes the directory's own grant apply to anything created
// in it afterward - so this now only ever touches the target's own ACL entry, never a
// file already sitting inside a directory it is applied to. `icacls` shelled out to the
// same way `git` already is above; `/C` keeps it going past one bad entry instead of
// aborting the whole reset, and its own exit code is not trusted as proof of anything -
// only a caller reading the ACL back can say whether it worked.
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

// Decision, not an inherited default: a worktree keeps its own journal.
// `getRepoRoot` resolves `--show-toplevel`, the worktree's own root - never
// `--git-common-dir`'s shared repository, which this deliberately does not read.
//
// Two reasons hold it there. First, the layout an agent runner actually gives each agent
// - Orca sets ORCA_WORKTREE_ID and does exactly this - is a bare clone plus worktrees,
// which has no main working tree to write into at all: `--git-common-dir` there names the
// bare `.git`, whose parent is not a checkout. Second, even where a main worktree does
// exist, writing into it from worktree B would dirty a checkout on a different branch,
// possibly with uncommitted work of its own, whose `.gitignore` was never asked to carry
// the entry `aidd telemetry on` added when B turned measurement on.
//
// Cross-worktree joining - so a report can still see every worktree's sessions together -
// `worktreeFields` above names the worktree on `session_start`, and the write
// target stays exactly where this function has always put it.
function resolveRunsDir(cwd) {
  const location = getRepoLocation(cwd);
  if (!location || !telemetryEnabled(location.repoRoot)) return null;
  return { ...location, dir: runsDir(location.repoRoot) };
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
