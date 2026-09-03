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
 * Answers what it did, in a word, so a caller can log or count without re-deriving it:
 *
 *   `"no-delegate"`   nothing to call, so nothing to repair — the state `off` leaves
 *   `"present"`       the hook already calls it
 *   `"repaired"`      the line was missing and has been put back
 *   `"unwritable"`    the hook could not be read or written; a session is not the place to
 *                     fail over this, and `check` is where a person is told
 *
 * Never throws. This runs inside a hook, and a hook that throws is a session that reports an
 * error for something no session did.
 */
function repairCommitTrailerHook(hooksDir) {
  if (typeof hooksDir !== "string" || hooksDir === "") return "no-delegate";
  const delegatePath = path.join(hooksDir, DELEGATE_FILE);
  if (!fs.existsSync(delegatePath)) return "no-delegate";

  const hookPath = path.join(hooksDir, HOOK_FILE);
  const line = hookLine(delegatePath);
  try {
    const existing = fs.existsSync(hookPath)
      ? fs.readFileSync(hookPath, "utf8")
      : `${HOOK_HEADER}\n`;
    if (existing.includes(line)) return "present";
    const separator = existing.endsWith("\n") ? "" : "\n";
    fs.writeFileSync(hookPath, `${existing}${separator}${line}\n`);
    fs.chmodSync(hookPath, 0o755);
    return "repaired";
  } catch {
    return "unwritable";
  }
}

module.exports = { repairCommitTrailerHook, hookLine, DELEGATE_FILE, HOOK_FILE };
