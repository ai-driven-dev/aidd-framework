import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { mapCopilotEventsToSinkRecords } from "../domain/formats/copilot-events.js";
import type {
  LocalCostReadResult,
  SessionCostReader,
} from "../domain/ports/session-cost-reader.js";

/** The session id names the exact file, so there is no directory to walk and the stamped
 * `vendor_id` is the id asked for rather than one re-derived from the file's content. A
 * missing file is no trace of the session, not a session that cost nothing. */
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
