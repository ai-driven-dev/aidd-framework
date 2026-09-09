import { createRequire } from "node:module";
import { join } from "node:path";
import { REPOSITORY_ROOT } from "./repository-root.js";

const hookLib = (name: string): string =>
  join(REPOSITORY_ROOT, "plugins", "aidd-telemetry", "hooks", "lib", name);

/** The journal hook is zero-dependency CommonJS copied verbatim into user projects, so it ships
 * no types and production code cannot import it. Tests reach it here, declaring only the
 * surface they exercise, so a name the hook stops exporting fails loudly. */
interface JournalRepoModule {
  getRepoRoot(cwd: string): string | null;
  getRemoteUrl(repoRoot: string): string | null;
  parseOwnerRepoFromRemote(remoteUrl: string | null): string | null;
  sanitizeProjectId(projectId: string): string;
  sanitizePathSegment(segment: string): string;
  deriveProjectId(repoRoot: string): string;
  telemetryEnabled(repoRoot: string): boolean;
  personRefusesTelemetry(): boolean;
}

export const journalRepo: JournalRepoModule = createRequire(import.meta.url)(hookLib("repo.cjs"));

/** The same reach into `record.cjs`, for the one derivation the reader side must agree with: a
 * Codex session's identity, taken from the rollout the hook is told the session writes. */
interface JournalRecordModule {
  codexSessionIdFromTranscriptPath(transcriptPath: unknown): string | undefined;
  readSessionId(host: string, payload: Record<string, unknown>): string | undefined;
  /** The schema the hook stamps on every `session_start`. Reached rather than copied, so the
   * reader's notion of what it can read is pinned against the writer's, not a second constant. */
  SCHEMA_VERSION: number;
}

export const journalRecord: JournalRecordModule = createRequire(import.meta.url)(
  hookLib("record.cjs")
);

/** The hook's own list of the hosts it writes for, so a conformance test can compare it
 * against what the tool declarations claim rather than against a second copy of the list. */
interface JournalHostModule {
  DECLARED_HOSTS: ReadonlySet<string>;
}

export const journalHost: JournalHostModule = createRequire(import.meta.url)(hookLib("host.cjs"));

/** The hook's file-writes module. `WRITTEN_PATH_EXTRACTOR_BY_HOST` is exposed so a test can
 * assert which hosts are covered rather than assume all of them are. */
interface JournalFileWritesModule {
  WRITTEN_PATH_EXTRACTOR_BY_HOST: Readonly<Record<string, unknown>>;
  taskFolderRelativePath(repoRoot: string, rawPath: string): string | null;
  handleFileWritten(
    payload: Record<string, unknown>,
    host: string,
    sessionId: string | undefined
  ): void;
}

export const journalFileWrites: JournalFileWritesModule = createRequire(import.meta.url)(
  hookLib("file-writes.cjs")
);

/** The hook's declaration module: a task can be declared on any host `journal.cjs`'s
 * `tool-used` dispatch reaches, and this is the one place that reads a call's own arguments. */
interface JournalTaskDeclaredModule {
  declaredTaskPath(payload: Record<string, unknown>): string | null;
  handleTaskDeclared(
    payload: Record<string, unknown>,
    host: string,
    sessionId: string | undefined
  ): void;
}

export const journalTaskDeclared: JournalTaskDeclaredModule = createRequire(import.meta.url)(
  hookLib("task-declared.cjs")
);

/** The hook's own trailer repair, exposed for the one thing the hook's own suite cannot prove:
 * that the line it writes is character for character the line the CLI writes. */
interface JournalTrailerRepairModule {
  repairCommitTrailerHook(hooksDir: string | undefined, gitDir?: string): string;
  hookLine(delegatePath: string): string;
  DELEGATE_FILE: string;
  HOOK_FILE: string;
  HOOK_HEADER: string;
}

export const journalTrailerRepair: JournalTrailerRepairModule = createRequire(import.meta.url)(
  hookLib("trailer-repair.cjs")
);
