// Everything the journal knows about OpenCode. It is not a stdin hook: opencode-plugin.js
// builds this payload itself, through the same session_id/cwd keys every stdin host uses, so
// the shape below stays one shape. It forwards no tool call, so there is no payload here for
// a step or a written path to be read from. Its own export is unmeasured, so vendorField
// names nothing, the same fact Cursor's entry states for the same reason.

module.exports = {
  readSessionId: (payload) => payload.session_id,
  readCwd: (payload) => payload.cwd,
  vendorField: null,
  stepStart: null,
  writtenPath: null,
};
