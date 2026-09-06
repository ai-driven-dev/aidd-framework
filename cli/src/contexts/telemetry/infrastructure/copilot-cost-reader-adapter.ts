import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { mapCopilotEventsToSinkRecords } from "../domain/formats/copilot-events.js";
import type {
  LocalCostReadResult,
  SessionCostReader,
} from "../domain/ports/session-cost-reader.js";

/**
 * Reads one Copilot session's own `~/.copilot/session-state/<id>/events.jsonl` directly,
 * rather than through `TranscriptCostReaderAdapter`'s directory walk: the session id names
 * the exact file, so there is nothing to search for and no other file that could be
 * mistaken for it. That directness is also what keeps `vendor_id` correct — the id this
 * reader stamps is the one it was asked for, never one re-derived from the file's own
 * content (see copilot-events.ts's header comment for why that distinction matters here).
 *
 * A missing file is no trace of the session, not a session that cost nothing — matching
 * every other reader's `sessionFound: false` for that case, whatever the underlying error
 * (missing directory, permissions, a session id that never wrote anything).
 */
export class CopilotCostReaderAdapter implements SessionCostReader {
  constructor(private readonly homeDir: string) {}

  async read(sessionId: string): Promise<LocalCostReadResult> {
    const path = join(this.homeDir, ".copilot", "session-state", sessionId, "events.jsonl");
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch {
      return { records: [], sessionFound: false };
    }
    return { records: mapCopilotEventsToSinkRecords(content, sessionId), sessionFound: true };
  }
}
