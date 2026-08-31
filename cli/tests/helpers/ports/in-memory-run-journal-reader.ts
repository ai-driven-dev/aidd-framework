import type { RunJournal, RunJournalStore } from "../../../src/domain/ports/run-journal-reader.js";

/** In-memory double for `RunJournalStore` — a journal per session id, or `null` for a
 * session the map holds nothing for, mirroring the port's own contract of never throwing.
 * `runFileNames` is settable directly rather than derived from `journals`: a name-only
 * listing must be able to name a file `list()` could never parse, which is exactly the
 * damaged-journal case a caller of `listRunFiles()` needs. `undeletable`, mirroring
 * `InMemoryTelemetrySink`, stands in for a run file that refuses removal. `deletedFromDirs`
 * records every `dir` argument `deleteRunFile` actually received — what a mutation test
 * checks to prove a caller passed the preview's own path, never this double's `runsDir`. */
export class InMemoryRunJournalReader implements RunJournalStore {
  readonly runsDir = "/fake/project/aidd_docs/runs";
  runFileNames: string[] = [];
  readonly deletedFiles: string[] = [];
  readonly deletedFromDirs: string[] = [];
  readonly undeletable = new Set<string>();
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

  async deleteRunFile(dir: string, fileName: string): Promise<void> {
    if (this.undeletable.has(fileName)) throw new Error(`cannot delete ${fileName}`);
    this.deletedFromDirs.push(dir);
    this.runFileNames = this.runFileNames.filter((name) => name !== fileName);
    this.deletedFiles.push(fileName);
  }
}

/** No run file for any session — every candidate falls through to unattributed, exactly as
 * a session with telemetry enabled but no journal beside it would read. */
export const NULL_RUN_JOURNAL_READER: RunJournalStore = {
  runsDir: "/fake/project/aidd_docs/runs",
  read: async () => null,
  list: async () => [],
  listRunFiles: async () => [],
  deleteRunFile: async () => {},
};
