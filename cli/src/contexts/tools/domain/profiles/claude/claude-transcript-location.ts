import { sep } from "node:path";
import type { TranscriptLocation } from "../../../../../kernel/measurement.js";

/** Where Claude Code keeps a session's transcript, and which file belongs to which session.
 * Declared beside the profile that names it: only the tool knows its own directory layout,
 * and the adapter that opens the files never encodes one itself. */
function matchesMainTranscript(segments: readonly string[], sessionId: string): boolean {
  return segments.length === 2 && segments[1] === `${sessionId}.jsonl`;
}

function matchesSubagentTranscript(segments: readonly string[], sessionId: string): boolean {
  return (
    segments.length === 4 &&
    segments[1] === sessionId &&
    segments[2] === "subagents" &&
    segments[3].endsWith(".jsonl")
  );
}

export const CLAUDE_CODE_TRANSCRIPT_LOCATION: TranscriptLocation = {
  root: (homeDir) => `${homeDir}${sep}.claude${sep}projects`,
  matches: (relativePath, sessionId) => {
    const segments = relativePath.split(sep);
    return (
      matchesMainTranscript(segments, sessionId) || matchesSubagentTranscript(segments, sessionId)
    );
  },
};
