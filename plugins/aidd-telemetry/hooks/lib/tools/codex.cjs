// Everything the journal knows about Codex: session identity from the rollout it is
// actually writing rather than from its payload's own session_id, cwd straight off its
// payload, a SKILL.md read naming its step with turn_id as the turn it belongs to, and no
// written-path extractor - a write reaches the journal through an apply_patch command
// string, which no field here names.

const { skillNameFromSkillFileRead } = require("./skill-detection.cjs");

// A Codex rollout is named `rollout-<timestamp>-<uuid>.jsonl`, and that trailing uuid is
// the identity both sides of this system join on: the hook writes it as `vendor_id` (see
// `readSessionId` below) and the reader resolves a session by it (CODEX_ROLLOUT_LOCATION in
// cli/src/contexts/telemetry/domain/formats/codex-rollout.ts, whose `matches` compares
// `-<uuid>.jsonl`). The join is filename to filename, and holds by construction.
//
// It is NOT read as `session_meta.id`, and an earlier version of this comment said it was -
// "measured across every rollout on disk". Re-measured 2026-09-01 over 418 rollouts, that
// claim is false: two of them, both `thread_source: "realtime_voice"`, carry a
// `session_meta.id` that is not the uuid in their own filename. Nothing broke, because no
// code here ever reads that field; what broke was the sentence explaining why this works.
//
// The two parses live apart because hooks/ is copied verbatim by the framework build and
// can import nothing from cli/ - the same reason sanitizePathSegment is duplicated - so
// tests/domain/formats/codex-rollout.unit.test.ts pins them to each other and turns red if
// either moves.
const CODEX_ROLLOUT_PREFIX = "rollout-";
const CODEX_ROLLOUT_EXTENSION = ".jsonl";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function codexSessionIdFromTranscriptPath(transcriptPath) {
  if (typeof transcriptPath !== "string" || transcriptPath === "") return undefined;
  const base = transcriptPath.split(/[\\/]/u).pop() || "";
  if (!base.startsWith(CODEX_ROLLOUT_PREFIX) || !base.endsWith(CODEX_ROLLOUT_EXTENSION)) {
    return undefined;
  }
  const stem = base.slice(0, -CODEX_ROLLOUT_EXTENSION.length);
  const candidate = stem.slice(-36);
  return UUID_PATTERN.test(candidate) && stem.length > 36 ? candidate : undefined;
}

// The filename first, `session_id` only as the fallback for a payload carrying no transcript
// path - because the two disagree often. Measured 2026-09-01 over 418 rollouts on the
// machine this was written on: 158 carry a `session_meta.session_id` that is not their own
// `session_meta.id`, and it is `thread_source` that explains which - 89 `subagent`, 11
// `user`, 58 with the field unset. A vendor_id written from `session_id` on any of those
// names another rollout, and joins to nothing while the journal still looks healthy.
function readSessionId(payload) {
  return codexSessionIdFromTranscriptPath(payload.transcript_path) ?? payload.session_id;
}

module.exports = {
  readSessionId,
  codexSessionIdFromTranscriptPath,
  readCwd: (payload) => payload.cwd,
  // Measured 2026-08-13, on codex.sse_event.
  vendorField: "conversation.id",
  stepStart: { skillName: skillNameFromSkillFileRead, turnIdField: "turn_id" },
  writtenPath: null,
};
