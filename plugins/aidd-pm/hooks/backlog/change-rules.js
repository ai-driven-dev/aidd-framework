// What only a before and an after can prove. A file never carries its own history,
// so this runs before the write, where both states are still available.

const { STATUSES, TERMINAL, TRANSITIONS } = require("./contract.js");
const { diagnostic } = require("./diagnostic.js");

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

module.exports = { checkBirth, checkTransition };
