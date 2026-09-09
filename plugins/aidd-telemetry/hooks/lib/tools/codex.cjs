// Everything the journal knows about Codex: session identity from the rollout it is
// actually writing rather than from its payload's own session_id, cwd straight off its
// payload, a SKILL.md read naming its step with turn_id as the turn it belongs to, and no
// written-path extractor - a write reaches the journal through an apply_patch command
// string, which no field here names.

const { skillNameFromSkillFileRead } = require("./skill-detection.cjs");

// A Codex rollout is named `rollout-<timestamp>-<uuid>.jsonl`, and that trailing uuid is the
// identity both sides join on: the hook writes it as `vendor_id`, the reader resolves a
// session by it. The join is filename to filename, and holds by construction. It is never
// read as `session_meta.id`, which a rollout can carry differently from its own filename.
//
// The two parses live apart because hooks/ is copied verbatim and can import nothing from
// cli/ - the same reason sanitizePathSegment is duplicated - so a test pins them to each
// other and turns red if either moves.
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
// path: the two disagree on well over a third of rollouts, subagent threads most of all, and
// a vendor_id written from `session_id` there names another rollout and joins to nothing
// while the journal still looks healthy.
function readSessionId(payload) {
  return codexSessionIdFromTranscriptPath(payload.transcript_path) ?? payload.session_id;
}

module.exports = {
  readSessionId,
  codexSessionIdFromTranscriptPath,
  readCwd: (payload) => payload.cwd,
  // Measured on codex.sse_event.
  vendorField: "conversation.id",
  stepStart: { skillName: skillNameFromSkillFileRead, turnIdField: "turn_id" },
  writtenPath: null,
};
