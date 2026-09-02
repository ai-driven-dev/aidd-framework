// Everything the journal knows about Cursor: it names its working directory
// workspace_roots, never cwd, and a SKILL.md read is the only evidence of which step ran,
// with generation_id as the turn it belongs to. No written-path extractor - Cursor was
// never captured handing a path to a hook. Its own telemetry export is itself unmeasured
// (an Enterprise team setting nobody here can turn on), so vendorField names nothing.

const { getRepoRoot } = require("../repo.cjs");
const { skillNameFromSkillFileRead } = require("./skill-detection.cjs");

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

module.exports = {
  readSessionId: (payload) => payload.session_id,
  readCwd: (payload) => firstGitWorkspaceRoot(payload.workspace_roots),
  // A documented-but-uncaptured attribute name would be exactly the false figure this
  // field exists to prevent.
  vendorField: null,
  stepStart: { skillName: skillNameFromSkillFileRead, turnIdField: "generation_id" },
  writtenPath: null,
};
