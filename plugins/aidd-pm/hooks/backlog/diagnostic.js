const { GRAPH_CODES } = require("./contract.js");

// Provable only from a before and an after, never from a stored file.
const CHANGE_CODES = new Set(["ILLEGAL_TRANSITION", "TERMINAL_AT_CREATION"]);

/** One finding, tagged with what it takes to prove it. */
function diagnostic(code, artifactPath, message, field, target) {
  return {
    severity: "error",
    code,
    scope: CHANGE_CODES.has(code) ? "change" : GRAPH_CODES.has(code) ? "graph" : "file",
    path: artifactPath,
    ...(field ? { field } : {}),
    ...(target ? { target } : {}),
    message,
  };
}

/** Sorted so a run always reports the same findings in the same order. */
function sortDiagnostics(diagnostics) {
  const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
  return diagnostics.sort(
    (a, b) =>
      compare(a.path, b.path) || compare(a.code, b.code) || compare(a.field || "", b.field || ""),
  );
}

/** What a single write can prove, which is all the write-time hook may report. */
function fileScope(result) {
  const diagnostics = result.diagnostics.filter((item) => item.scope === "file");
  return { ...result, valid: diagnostics.length === 0, diagnostics };
}

module.exports = { diagnostic, fileScope, sortDiagnostics };
