// Everything the journal knows about Codex: session identity from the rollout it is
// actually writing rather than from its payload's own session_id, cwd straight off its
// payload, a SKILL.md read naming its step with turn_id as the turn it belongs to, and no
// written-path extractor - a write reaches the journal through an apply_patch command
// string, which no field here names.

const { skillNameFromSkillFileRead } = require("./skill-detection.cjs");

// A Codex rollout is named `rollout-<timestamp>-<uuid>.jsonl`, and that trailing uuid is
// the rollout's own `session_meta.id` - measured across every rollout on disk, including
// resumed ones where it differs from `session_meta.session_id`. The reader side resolves a
// Codex session on exactly this equality; see CODEX_ROLLOUT_LOCATION in
// cli/src/domain/formats/codex-rollout.ts, whose `matches` this mirrors. The two parses
// live apart because hooks/ is copied verbatim by the framework build and can import
// nothing from cli/ - the same reason sanitizePathSegment is duplicated - so
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

// 124 of 330 rollouts on this machine are resumed sessions where `session_meta.session_id`
// holds the parent's identifier rather than the rollout's own, and a vendor_id written from
// the wrong one joins to nothing while the journal still looks healthy. `session_id` is the
// fallback for a payload carrying no transcript path.
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
