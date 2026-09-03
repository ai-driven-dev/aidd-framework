"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Puts back the one line that makes a commit carry its session, when something removed it.
 *
 * `aidd telemetry on` installs two things: a delegate script, which is ours outright and
 * which nobody regenerates, and a single line in `prepare-commit-msg` that calls it. Only
 * the second is fragile — in a repository where lefthook or husky owns that file, it is
 * generated, and a generated file is rewritten. Measured on the repository this was built
 * in: lefthook rewrote three hooks on 2026-09-02 and spared `prepare-commit-msg` only
 * because its config declared no job for that event.
 *
 * So this does not defend the call site, it re-establishes it. **It never asks why the line
 * is gone**, and that is what lets one path cover every cause — a regenerated hook, an
 * overwrite by hand, a `core.hooksPath` that moved, a hook that never existed. No
 * third-party tool is named anywhere here, so nothing rots when one of them changes format.
 *
 * The opt-out is the one a person already knows. `aidd telemetry off` deletes the delegate,
 * and this only ever runs when the delegate is present, so nothing is ever resurrected after
 * `off`. Removing the line by hand while keeping the file is not an opt-out and was never
 * documented as one; `aidd telemetry check` reports what is in place either way.
 */

/** The delegate's filename and the line that calls it. Both are the CLI's
 * (`cli/src/domain/formats/commit-session-trailer.ts`), and both are spelled again here
 * because this file is zero-dependency CommonJS shipped into a person's repository and
 * cannot import from a TypeScript program that may not be installed.
 *
 * The duplication is real and it is guarded the way this plugin's other cross-language
 * literal is: a test spawns this hook, reads the file it repaired, and compares it against
 * what the CLI's own function produces — never against a second copy of the string typed
 * into a fixture. Two sides that each assert their own spelling agree with themselves. */
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
 * Answers what it did, in a word. Nothing in the hook reads it — a session start has no
 * business reporting on a repair — and it exists for the tests, which are the only reader
 * that needs to tell "declined" from "nothing to do" without inspecting the filesystem
 * twice:
 *
 *   `"no-delegate"`   nothing to call, so nothing to repair — the state `off` leaves
 *   `"not-ours-to-write"` the hook is version-controlled or a symlink; see `isOursToWrite`
 *   `"present"`       the hook already calls it
 *   `"repaired"`      the line was missing and has been put back
 *   `"unwritable"`    the hook could not be read or written; a session is not the place to
 *                     fail over this, and `check` is where a person is told
 *
 * Never throws. This runs inside a hook, and a hook that throws is a session that reports an
 * error for something no session did.
 */
function repairCommitTrailerHook(hooksDir, gitDir) {
  if (typeof hooksDir !== "string" || hooksDir === "") return "no-delegate";
  if (!fs.existsSync(path.join(hooksDir, DELEGATE_FILE))) return "no-delegate";
  // The physical directory, and everything below is built from it: the guard compares
  // realpaths, so a line built from the unresolved spelling would name a path the guard
  // never approved. On macOS, where `/tmp` is a link to `/private/tmp`, that put two call
  // sites in one hook — the delegate ran twice per commit, and `check` then called the file
  // "somebody else's too" about two lines this project wrote.
  const resolved = realPath(hooksDir);
  if (resolved === null || !isOursToWrite(resolved, gitDir)) return "not-ours-to-write";

  const delegatePath = path.join(resolved, DELEGATE_FILE);
  const hookPath = path.join(resolved, HOOK_FILE);
  // A symlink is somebody's deliberate indirection, and every write here follows one —
  // which would edit whatever it points at, most usefully a file the team shares.
  if (isSymbolicLink(hookPath)) return "not-ours-to-write";

  // `rename` needs the directory, not the file — so without this a `0444` hook is silently
  // replaced and left reading `0444`, its content changed while its permissions say it
  // cannot be. Asked before anything is written, so the answer is "declined", not "done".
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
 * Beside the target and renamed over it where that is possible, directly where it is not.
 *
 * Renaming is what stops a session starting at the same moment from reading a half-written
 * hook and appending to the fragment. But staging needs write permission on the *directory*,
 * where a direct write needs it only on the file — measured, a `0555` hooks directory
 * holding a writable hook takes the direct write and refuses the staged one. Repairing that
 * repository mattered before this function existed, so the fallback keeps it.
 *
 * The mode is carried across deliberately: `rename` replaces the inode, so without this a
 * `0700` hook would come back `0755` and a non-executable one would come back executable —
 * widening a third party's file on a path meant to be conservative.
 */
function write(hookPath, content) {
  const mode = modeOf(hookPath);
  const staging = `${hookPath}.aidd-${process.pid}`;
  try {
    // The mode on this call has no test that can fail for it: `chmod` below sets the same
    // bits a moment later, so removing it leaves every case green. It stays because it
    // narrows the window in which the staging file exists wider than the hook it replaces,
    // and that window is not something a test here can observe.
    fs.writeFileSync(staging, content, { mode });
    // `open(2)` applies the umask to the mode it is given, so a `0770` hook came back
    // `0750` — narrowed rather than widened, and just as much somebody else's file to have
    // changed. `chmod` is not filtered, and is what actually carries the mode across.
    fs.chmodSync(staging, mode);
    fs.renameSync(staging, hookPath);
    return "repaired";
  } catch {
    // Never leave the staging file behind: one per session, each under a different pid, in
    // the directory a person opens when something is wrong.
    //
    // Untested, and said rather than dressed up: no input reachable on POSIX gets past the
    // write and fails the rename. Both files sit in one directory, so there is no cross-device
    // case; a target that is a directory throws on the read long before here. The case this
    // exists for is Windows, where renaming over a file another process holds open fails
    // EPERM — and no test on this branch runs there.
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

/** The hook's own permission bits, or the mode git needs to run one when there is no hook
 * yet. Never widened: a file that was not executable stays that way, and `check` reports it
 * rather than this quietly fixing it. */
function modeOf(hookPath) {
  try {
    return fs.statSync(hookPath).mode & 0o777;
  } catch {
    return 0o755;
  }
}

/**
 * Only a hooks directory physically inside the repository's own git directory.
 *
 * `core.hooksPath` may point at a directory in the working tree — a checked-in `.githooks/`
 * is a common way to share hooks with a team. Appending there dirties a tracked file, on
 * every session start, with a machine-absolute path that cannot be committed; and a
 * `git checkout` restoring the file brings it straight back.
 *
 * **Physically, through `realpath`, not lexically through `resolve`.** An independent check
 * reproduced the difference: `ln -s ../.githooks .git/hooks` makes git answer
 * `<repo>/.git/hooks`, which is inside the git directory by string and inside the working
 * tree on disk. `path.resolve` never resolves a link, so the containment test passed and
 * `lstat` on the hook file — reached through the linked directory — saw a real file rather
 * than a link. Both guards were defeated at once, and a tracked file was modified.
 *
 * A path that cannot be resolved declines: this is the guard that decides whether to write
 * into somebody's repository, and the failure direction it takes is "do not".
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

module.exports = { repairCommitTrailerHook, hookLine, DELEGATE_FILE, HOOK_FILE, HOOK_HEADER };
