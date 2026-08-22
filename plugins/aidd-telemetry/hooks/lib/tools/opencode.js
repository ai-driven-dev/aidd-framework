// Everything the journal knows about OpenCode. It is not a stdin hook - its own plugin
// module (hooks/opencode-plugin.js) builds this payload itself, from the session's own
// `directory` (session_start) or the plugin's own init-time directory (turn_end) - but
// reads through the same session_id/cwd keys every stdin host uses, so the shape below
// stays one shape. It forwards only session.created and session.idle, never a tool call,
// so there is no payload here for a step or a written path to be read from at all.
// telemetryExport is itself unmeasured (session.id is documented on the ai.streamText span
// behind experimental.openTelemetry, but no export has been captured to confirm it - that
// is #653's probe, not this one), so vendorField names nothing, the same fact Cursor's
// entry states for the same reason.

module.exports = {
  readSessionId: (payload) => payload.session_id,
  readCwd: (payload) => payload.cwd,
  vendorField: null,
  stepStart: null,
  writtenPath: null,
};
