// The unrecognised-payload marker's file name. Copied from hooks/lib/record.js's own
// export, never required from it - see switch.js for why a require across the skill/hooks
// boundary is not made here. scripts/__tests__/telemetry-check.test.js pins this copy's
// value against the hook's so the two cannot drift unnoticed.

const UNRECOGNISED_FILE_NAME = "_unrecognised.jsonl";

module.exports = { UNRECOGNISED_FILE_NAME };
