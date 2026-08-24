// The run journal lives inside the repository it describes, because it records
// repository-relative paths and task folders. What follows from that, and had been
// left undrawn until it bit: it sits in a git repository, so it has to be ignored.
//
// The hook writes it 0700/0600 because it says who worked on what, for how long, and
// names every file each session wrote. All of that care is undone by one `git add .`.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const RUNS_ENTRY = "aidd_docs/runs/";

/**
 * Ignored by default because the safe answer is the one a person cannot regret, and said
 * out loud because a team that wants its journal committed - for shared traceability, or
 * an audit trail - is a real position this must not decide for them. Asking instead would
 * be worse: a headless run has nobody to answer, and a prompt on every enable becomes a
 * keystroke. So the default is safe, the change is announced, and undoing it is deleting
 * one line from a file they already own.
 *
 * Only the journal, never a wider directory: ignoring more than needed is how a file
 * somebody wanted stops being offered.
 */
function ignoreRunsDir(projectRoot) {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : "";
  if (existing.split("\n").some((line) => line.trim() === RUNS_ENTRY)) return;
  const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
  fs.writeFileSync(gitignorePath, `${existing}${separator}${RUNS_ENTRY}\n`);
  process.stdout.write(
    `Added ${RUNS_ENTRY} to .gitignore - the journal names who worked on what and for how ` +
      "long. Delete that line to commit it instead.\n"
  );
}

/**
 * Ignoring reaches nothing already tracked, so a journal that is in history stays there.
 * Named once, with what it holds, and nothing is removed or rewritten: what to do about a
 * commit that is already pushed is the person's decision, not this script's.
 */
function warnIfTracked(projectRoot) {
  const found = spawnSync("git", ["ls-files", "--", RUNS_ENTRY], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const tracked = found.status === 0 ? found.stdout.split("\n").filter(Boolean) : [];
  if (tracked.length === 0) return;
  process.stdout.write(
    "Already tracked by git - who worked on what, for how long, and every file written:\n" +
      `${tracked.map((file) => `  ${file}\n`).join("")}Nothing removed or rewritten - your call.\n`
  );
}

module.exports = { RUNS_ENTRY, ignoreRunsDir, warnIfTracked };
