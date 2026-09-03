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
  const delegatePath = path.join(hooksDir, DELEGATE_FILE);
  if (!fs.existsSync(delegatePath)) return "no-delegate";
  if (!isOursToWrite(hooksDir, gitDir)) return "not-ours-to-write";

  const hookPath = path.join(hooksDir, HOOK_FILE);
  // A symlink is somebody's deliberate indirection, and `writeFileSync` follows it — which
  // would edit whatever it points at, most usefully a file the team shares. Left alone.
  if (isSymbolicLink(hookPath)) return "not-ours-to-write";

  const line = hookLine(delegatePath);
  try {
    const existing = fs.existsSync(hookPath)
      ? fs.readFileSync(hookPath, "utf8")
      : `${HOOK_HEADER}\n`;
    if (existing.includes(line)) return "present";
    const separator = existing.endsWith("\n") ? "" : "\n";
    // Written beside the target and renamed over it, never truncated in place. Two sessions
    // can start at once, and one reading a half-written file and appending to it would
    // destroy the content this promises to keep. `rename` within a directory is atomic.
    const staging = `${hookPath}.aidd-${process.pid}`;
    fs.writeFileSync(staging, `${existing}${separator}${line}\n`, { mode: 0o755 });
    fs.renameSync(staging, hookPath);
    return "repaired";
  } catch {
    return "unwritable";
  }
}

/**
 * Only a hooks directory inside the repository's own git directory.
 *
 * `core.hooksPath` may point at a directory in the working tree — `.githooks/` checked into
 * the repository is a common way to share hooks with a team. Appending there dirties a
 * tracked file, on every session start, with a machine-absolute path that cannot be
 * committed; and a `git checkout` restoring the file brings it straight back.
 *
 * `aidd telemetry on` writing that line once was a write a person asked for. This one is
 * not: nobody typed it, it recurs, and it lands in content under version control. So the
 * rule is the narrow one — repair only where the CLI's own install would have written, and
 * leave everything else to `aidd telemetry check`, which reports the call site either way.
 */
function isOursToWrite(hooksDir, gitDir) {
  if (typeof gitDir !== "string" || gitDir === "") return false;
  const inside = path.resolve(gitDir);
  const target = path.resolve(hooksDir);
  return target === inside || target.startsWith(inside + path.sep);
}

function isSymbolicLink(target) {
  try {
    return fs.lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

module.exports = { repairCommitTrailerHook, hookLine, DELEGATE_FILE, HOOK_FILE, HOOK_HEADER };
