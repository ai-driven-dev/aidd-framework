import type {
  RunJournal,
  RunJournalStore,
} from "../../../src/contexts/telemetry/domain/ports/run-journal-reader.js";

/** In-memory double for `RunJournalStore`. `runFileNames` is settable rather than derived, so
 * a listing can name a file `list()` could never parse; `undeletable` stands in for a run file
 * that refuses removal; `deletedFromDirs` and `listCalls` record what a caller actually did. */
export class InMemoryRunJournalReader implements RunJournalStore {
  readonly runsDir = "/fake/project/aidd_docs/runs";
  runFileNames: string[] = [];
  /** Settable directly, like `runFileNames` and for the same reason: a refused journal is
   * one `list()` never returns, so it cannot be derived from what this double holds. */
  foreignSchemaVersions: number[] = [];
  readonly deletedFiles: string[] = [];
  readonly deletedFromDirs: string[] = [];
  readonly undeletable = new Set<string>();
  listCalls = 0;
  private readonly journals = new Map<string, RunJournal>();

  set(sessionId: string, journal: RunJournal): void {
    this.journals.set(sessionId, journal);
  }

  async read(sessionId: string): Promise<RunJournal | null> {
    return this.journals.get(sessionId) ?? null;
  }

  async list(): Promise<readonly RunJournal[]> {
    this.listCalls += 1;
    return [...this.journals.values()];
  }

  async listRunFiles(): Promise<readonly string[]> {
    return this.runFileNames;
  }

  async listForeignSchemas(): Promise<readonly number[]> {
    return this.foreignSchemaVersions;
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
  listForeignSchemas: async () => [],
  deleteRunFile: async () => {},
};
