// One printed line per claim, and nothing that summarises them: a reader who wants the
// whole answer reads every line, because the line that would save them the trouble is
// exactly where a false "ok" hides.

const { UNKNOWN } = require("./diagnose.js");

const LABEL_WIDTH = 22;
const pad = (label) => label.padEnd(LABEL_WIDTH);

function printClaim(out, claim) {
  out(`  ${pad(claim.label)}${claim.verdict.padEnd(4)}  ${claim.detail}`);
}

/** Named from the same declaration the readers use, and never counted toward health: an
 * uncovered tool is neither `ok` nor `FAIL`, it is a fact about what this build can read.
 * `reason` covers a tool with no reader at all; `limitation` covers one that reads but
 * whose own sessions a journal sweep can never name, which this check relies on. */
function printUncovered(out, declaration) {
  const label = `not covered: ${declaration.tool}`;
  out(`  ${pad(label)}${UNKNOWN.padEnd(4)}  ${declaration.reason ?? declaration.limitation}`);
}

function printReport(out, { claims, uncovered }) {
  for (const claim of claims) printClaim(out, claim);
  for (const declaration of uncovered) printUncovered(out, declaration);
}

module.exports = { printReport };
