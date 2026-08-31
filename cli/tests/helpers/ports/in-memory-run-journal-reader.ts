import type { RunJournal, RunJournalReader } from "../../../src/domain/ports/run-journal-reader.js";

/** In-memory double for `RunJournalReader` — a journal per session id, or `null` for a
 * session the map holds nothing for, mirroring the port's own contract of never throwing.
 * `runFileNames` is settable directly rather than derived from `journals`: a name-only
 * listing must be able to name a file `list()` could never parse, which is exactly the
 * damaged-journal case a caller of `listRunFiles()` needs. */
export class InMemoryRunJournalReader implements RunJournalReader {
  readonly runsDir = "/fake/project/aidd_docs/runs";
  runFileNames: string[] = [];
  private readonly journals = new Map<string, RunJournal>();

  set(sessionId: string, journal: RunJournal): void {
    this.journals.set(sessionId, journal);
  }

  async read(sessionId: string): Promise<RunJournal | null> {
    return this.journals.get(sessionId) ?? null;
  }

  async list(): Promise<readonly RunJournal[]> {
    return [...this.journals.values()];
  }

  async listRunFiles(): Promise<readonly string[]> {
    return this.runFileNames;
  }
}

/** No run file for any session — every candidate falls through to unattributed, exactly as
 * a session with telemetry enabled but no journal beside it would read. */
export const NULL_RUN_JOURNAL_READER: RunJournalReader = {
  runsDir: "/fake/project/aidd_docs/runs",
  read: async () => null,
  list: async () => [],
  listRunFiles: async () => [],
};
