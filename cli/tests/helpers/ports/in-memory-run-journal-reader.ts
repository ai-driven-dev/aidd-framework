import type { RunJournal, RunJournalReader } from "../../../src/domain/ports/run-journal-reader.js";

/** In-memory double for `RunJournalReader` — a journal per session id, or `null` for a
 * session the map holds nothing for, mirroring the port's own contract of never throwing. */
export class InMemoryRunJournalReader implements RunJournalReader {
  private readonly journals = new Map<string, RunJournal>();

  set(sessionId: string, journal: RunJournal): void {
    this.journals.set(sessionId, journal);
  }

  async read(sessionId: string): Promise<RunJournal | null> {
    return this.journals.get(sessionId) ?? null;
  }
}

/** No run file for any session — every candidate falls through to unattributed, exactly as
 * a session with telemetry enabled but no journal beside it would read. */
export const NULL_RUN_JOURNAL_READER: RunJournalReader = {
  read: async () => null,
};
