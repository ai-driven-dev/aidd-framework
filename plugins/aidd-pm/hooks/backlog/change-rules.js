// What only a before and an after can prove. A file never carries its own history, so one
// write is judged while both its states exist, and the whole turn is judged once it is over.

const { STATUSES, TERMINAL, TRANSITIONS } = require("./contract.js");
const { diagnostic, sortDiagnostics } = require("./diagnostic.js");

/** Rejects a status move the artifact's lifecycle does not list. Silent on anything it cannot read. */
function checkTransition(before, after, artifactPath) {
  const type = after?.type;
  if (!before || !after || before.type !== type || !TRANSITIONS[type]) return [];
  if (!STATUSES[type].has(before.status) || !STATUSES[type].has(after.status)) return [];
  if (before.status === after.status) return [];

  const allowed = TRANSITIONS[type][before.status] ?? [];
  if (allowed.includes(after.status)) return [];

  const reachable = allowed.length > 0 ? allowed.join(", ") : "nothing";
  return [
    diagnostic(
      "ILLEGAL_TRANSITION",
      artifactPath,
      `${type} cannot move from ${before.status} to ${after.status}; ${before.status} leads to ${reachable}`,
      "status",
    ),
  ];
}

/** An artifact cannot be born finished: nothing was ever pursued. */
function checkBirth(after, artifactPath) {
  const type = after?.type;
  if (!TERMINAL[type] || !TERMINAL[type].has(after.status)) return [];
  return [
    diagnostic(
      "TERMINAL_AT_CREATION",
      artifactPath,
      `${type} cannot be created at ${after.status}`,
      "status",
    ),
  ];
}

function findingKey(item) {
  return [item.code, item.path, item.field ?? "", item.target ?? "", item.message].join("\0");
}

function introducedDiagnostics(before, after) {
  const known = new Set(before.diagnostics.map(findingKey));
  return after.diagnostics.filter((item) => !known.has(findingKey(item)));
}

/** The statuses an artifact held, first to last, with the standing still removed. */
function walk(opening, walked, closing) {
  const path = [opening, ...(walked || []), closing].filter((status) => status !== undefined && status !== null);
  return path.filter((status, index) => index === 0 || status !== path[index - 1]);
}

/**
 * What only the whole turn can prove: what appeared, what moved, what left. A turn may move an
 * artifact more than once, so each step is judged, never the shortcut from where it started.
 */
function checkChange(before, after, waypoints = {}, moved = new Map()) {
  const findings = introducedDiagnostics(before, after);
  const oldArtifacts = new Map(before.artifacts.map((artifact) => [artifact.id, artifact]));
  const newArtifacts = new Map(after.artifacts.map((artifact) => [artifact.id, artifact]));
  const newFiles = new Set(after.files || []);
  const leftBehind = new Set(moved.values());

  for (const file of before.files || []) {
    if (!newFiles.has(file) && !leftBehind.has(file)) {
      findings.push(
        diagnostic("ARTIFACT_DELETED", file, "backlog artifacts are concluded or cancelled, not deleted"),
      );
    }
  }

  for (const [identity, oldArtifact] of oldArtifacts) {
    const newArtifact = newArtifacts.get(identity);
    if (!newArtifact) {
      continue;
    }
    if (oldArtifact.type !== newArtifact.type) {
      findings.push(diagnostic("TYPE_CHANGED", identity, "an artifact cannot change type", "type"));
      continue;
    }
    const steps = walk(oldArtifact.status, waypoints[identity], newArtifact.status);
    for (let index = 1; index < steps.length; index += 1) {
      findings.push(...checkTransition(
        { ...oldArtifact, status: steps[index - 1] },
        { ...newArtifact, status: steps[index] },
        identity,
      ));
    }
  }

  for (const [identity, artifact] of newArtifacts) {
    if (oldArtifacts.has(identity)) continue;
    // A file that only changed place is the same artifact, so it opens where it already stood.
    const came = oldArtifacts.get(moved.get(identity));
    const steps = walk(came?.status, waypoints[identity], artifact.status);
    if (!came) findings.push(...checkBirth({ ...artifact, status: steps[0] }, identity));
    for (let index = 1; index < steps.length; index += 1) {
      findings.push(...checkTransition(
        { ...artifact, status: steps[index - 1] },
        { ...artifact, status: steps[index] },
        identity,
      ));
    }
  }

  return sortDiagnostics(findings);
}

module.exports = { checkBirth, checkChange, checkTransition, findingKey, introducedDiagnostics };
