"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Puts back the one line that makes a commit carry its session, when something removed it.
 *
 * The delegate script is ours outright and nobody regenerates it; the line calling it from
 * `prepare-commit-msg` is the fragile half. This declines wherever the CLI itself would have
 * declined — where a hook manager owns that file — or the delegate gains a second caller per
 * commit, the manager's job and a direct call nobody installed.
 *
 * It never asks why the line is gone, which is what lets one path cover every cause. The
 * managers are named in one place only, as root marker filenames, so nothing here rots when
 * either changes the format of what it generates.
 *
 * `aidd telemetry off` deletes the delegate and this only runs while the delegate is present,
 * so nothing is ever resurrected after `off`.
 */

/** Both are also the CLI's, spelled again here because this file is zero-dependency
 * CommonJS shipped into a person's repository and cannot import from a TypeScript program
 * that may not be installed. A test compares what this repairs against what the CLI's own
 * function produces, never against a second copy typed into a fixture. */
const DELEGATE_FILE = "aidd-session-trailer.sh";
const HOOK_FILE = "prepare-commit-msg";
const HOOK_HEADER = "#!/bin/sh";

/** Separators forced to `/`, for the reason the CLI states at the same seam: a hook is run
 * by the `sh` Git for Windows ships, and inside double quotes that shell treats a backslash
 * as an ordinary character, so `C:\\Users\\…` names nothing while `C:/Users/…` resolves. */
function hookLine(delegatePath) {
  return `sh "${delegatePath.replace(/\\/gu, "/")}" "$@"`;
}

/**
 * Every spelling lefthook accepts for its own config, in the order it looks for them, then
 * husky's directory. Mirrors the CLI's own list, spelled again for the reason `DELEGATE_FILE`
 * is, and pinned to that list by scripts/__tests__/aidd-telemetry-trailer-repair.test.js.
 */
const HOOK_MANAGER_MARKERS = Object.freeze([
  "lefthook.yml",
  "lefthook.yaml",
  ".lefthook.yml",
  ".lefthook.yaml",
  ".husky",
]);

/**
 * From the root's marker files alone, never from the hook's contents: a manager regenerates
 * that file, so by the time anything reads it the append is gone and the marker is all that
 * is left. The root is the worktree's own, not the git directory — in a linked worktree only
 * the first is where a manager's config sits.
 */
function hookManagerOwns(repoRoot) {
  if (typeof repoRoot !== "string" || repoRoot === "") return false;
  return HOOK_MANAGER_MARKERS.some((marker) => fs.existsSync(path.join(repoRoot, marker)));
}

/**
 * Answers what it did, in a word, for the tests: they are the only reader that needs to tell
 * "declined" from "nothing to do" without inspecting the filesystem twice.
 *
 *   `"no-delegate"`   nothing to call, so nothing to repair — the state `off` leaves
 *   `"manager-owned"` a hook manager owns the file and already reaches the delegate itself
 *   `"not-ours-to-write"` the hook is version-controlled or a symlink; see `isOursToWrite`
 *   `"present"`       the hook already calls it
 *   `"repaired"`      the line was missing and has been put back
 *   `"unwritable"`    the hook could not be read or written; a session is not the place to
 *                     fail over this, and `check` is where a person is told
 *
 * Never throws. This runs inside a hook, and a hook that throws is a session that reports an
 * error for something no session did.
 */
function repairCommitTrailerHook(hooksDir, gitDir, repoRoot) {
  if (typeof hooksDir !== "string" || hooksDir === "") return "no-delegate";
  if (!fs.existsSync(path.join(hooksDir, DELEGATE_FILE))) return "no-delegate";

  if (hookManagerOwns(repoRoot)) return "manager-owned";
  // The physical directory, since the guard compares realpaths: a line built from the
  // unresolved spelling names a path the guard never approved, which on macOS put two call
  // sites in one hook and ran the delegate twice per commit.
  const resolved = realPath(hooksDir);
  if (resolved === null || !isOursToWrite(resolved, gitDir)) return "not-ours-to-write";

  const delegatePath = path.join(resolved, DELEGATE_FILE);
  const hookPath = path.join(resolved, HOOK_FILE);
  // A symlink is somebody's deliberate indirection, and every write here follows one —
  // which would edit whatever it points at, most usefully a file the team shares.
  if (isSymbolicLink(hookPath)) return "not-ours-to-write";

  // `rename` needs the directory, not the file, so without this a `0444` hook is silently
  // replaced and left reading `0444`. Asked before anything is written.
  if (fs.existsSync(hookPath) && !isWritable(hookPath)) return "unwritable";

  const line = hookLine(delegatePath);
  try {
    const existing = fs.existsSync(hookPath)
      ? fs.readFileSync(hookPath, "utf8")
      : `${HOOK_HEADER}\n`;
    if (existing.includes(line)) return "present";
    return write(hookPath, `${existing}${existing.endsWith("\n") ? "" : "\n"}${line}\n`);
  } catch {
    return "unwritable";
  }
}

/**
 * Staged beside the target and renamed over it where possible, written directly where not.
 * Renaming stops a session starting at the same moment from reading a half-written hook, but
 * staging needs write permission on the directory: a `0555` hooks directory holding a
 * writable hook takes the direct write and refuses the staged one.
 *
 * The mode is carried across deliberately: `rename` replaces the inode, so a `0700` hook
 * would otherwise come back `0755`, widening a third party's file.
 */
function write(hookPath, content) {
  const mode = modeOf(hookPath);
  const staging = `${hookPath}.aidd-${process.pid}`;
  try {
    // No test can fail for this mode — `chmod` below sets the same bits — but it narrows the
    // window in which the staging file is wider than the hook it replaces.
    fs.writeFileSync(staging, content, { mode });
    // `open(2)` applies the umask to the mode it is given, so a `0770` hook comes back
    // `0750`. `chmod` is not filtered, and is what actually carries the mode across.
    fs.chmodSync(staging, mode);
    fs.renameSync(staging, hookPath);
    return "repaired";
  } catch {
    // Never leave the staging file behind: one per session, each under a different pid, in
    // the directory a person opens when something is wrong. Reachable only on Windows, where
    // renaming over a file another process holds open fails EPERM.
    try {
      fs.unlinkSync(staging);
    } catch {
      // Nothing to clean up, which is the ordinary case when the write itself failed.
    }
  }
  try {
    fs.writeFileSync(hookPath, content, { mode });
    return "repaired";
  } catch {
    return "unwritable";
  }
}

/** Never widened: a file that was not executable stays that way, and `check` reports it
 * rather than this quietly fixing it. */
function modeOf(hookPath) {
  try {
    return fs.statSync(hookPath).mode & 0o777;
  } catch {
    return 0o755;
  }
}

/**
 * Only a hooks directory physically inside the repository's own git directory. `core.hooksPath`
 * may point into the working tree — a checked-in `.githooks/` shared with a team — where
 * appending dirties a tracked file with a machine-absolute path on every session start.
 *
 * Physically, through `realpath`, never lexically: `ln -s ../.githooks .git/hooks` is inside
 * the git directory by string and inside the working tree on disk, and it defeats both a
 * `resolve` containment test and an `lstat` on the hook reached through the link.
 *
 * A path that cannot be resolved declines: this guard's failure direction is "do not".
 */
function isOursToWrite(hooksDir, gitDir) {
  if (typeof gitDir !== "string" || gitDir === "") return false;
  const inside = realPath(gitDir);
  const target = realPath(hooksDir);
  if (inside === null || target === null) return false;
  return target === inside || target.startsWith(inside + path.sep);
}

function realPath(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

function isWritable(target) {
  try {
    fs.accessSync(target, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function isSymbolicLink(target) {
  try {
    return fs.lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

module.exports = {
  repairCommitTrailerHook,
  hookLine,
  DELEGATE_FILE,
  HOOK_FILE,
  HOOK_HEADER,
  HOOK_MANAGER_MARKERS,
};
