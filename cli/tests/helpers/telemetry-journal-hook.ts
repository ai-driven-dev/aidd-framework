import { createRequire } from "node:module";

/**
 * The journal hook is zero-dependency CommonJS that `aidd framework build` copies verbatim
 * into user projects, so it ships no types and production code cannot import it — esbuild
 * leaves no `require` in the CLI's ESM output. Tests reach it here instead, declaring only
 * the surface they exercise; a name the hook stops exporting becomes a call on `undefined`,
 * which fails loudly rather than silently.
 */
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

export const journalRepo: JournalRepoModule = createRequire(import.meta.url)(
  "../../../plugins/aidd-telemetry/hooks/lib/repo.cjs"
);

/**
 * The same reach into `record.cjs`, for the one derivation the reader side must agree with:
 * a Codex session's identity, taken from the rollout the hook is told the session writes.
 */
interface JournalRecordModule {
  codexSessionIdFromTranscriptPath(transcriptPath: unknown): string | undefined;
  readSessionId(host: string, payload: Record<string, unknown>): string | undefined;
  /** The schema the hook stamps on every `session_start` it writes. Reached rather than
   * copied so the reader's own notion of which schema it can read is pinned against the
   * writer's, not against a second constant that can drift from it silently. */
  SCHEMA_VERSION: number;
}

export const journalRecord: JournalRecordModule = createRequire(import.meta.url)(
  "../../../plugins/aidd-telemetry/hooks/lib/record.cjs"
);

/** The hook's own list of the hosts it writes for, so a conformance test can compare it
 * against what the tool declarations claim rather than against a second copy of the list. */
interface JournalHostModule {
  DECLARED_HOSTS: ReadonlySet<string>;
}

export const journalHost: JournalHostModule = createRequire(import.meta.url)(
  "../../../plugins/aidd-telemetry/hooks/lib/host.cjs"
);

/** The hook's file-writes module, for the one line phase 2's task derivation rests on.
 * `WRITTEN_PATH_EXTRACTOR_BY_HOST` is exposed so a test can assert which hosts are covered
 * rather than assume all of them are. */
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
  "../../../plugins/aidd-telemetry/hooks/lib/file-writes.cjs"
);

/** The hook's declaration module, for the same reason `journalFileWrites` is exposed: a
 * task can now be declared on any host `journal.cjs`'s `tool-used` dispatch reaches, and this
 * is the one place that reads a tool call's own arguments for it. */
interface JournalTaskDeclaredModule {
  declaredTaskPath(payload: Record<string, unknown>): string | null;
  handleTaskDeclared(
    payload: Record<string, unknown>,
    host: string,
    sessionId: string | undefined
  ): void;
}

export const journalTaskDeclared: JournalTaskDeclaredModule = createRequire(import.meta.url)(
  "../../../plugins/aidd-telemetry/hooks/lib/task-declared.cjs"
);

/** The hook's own trailer repair. Exposed for the one thing a test on this side must prove
 * and the hook's own suite cannot: that the line this writes is character for character the
 * line the CLI writes, when neither can import the other. */
interface JournalTrailerRepairModule {
  repairCommitTrailerHook(hooksDir: string | undefined, gitDir?: string): string;
  hookLine(delegatePath: string): string;
  DELEGATE_FILE: string;
  HOOK_FILE: string;
  HOOK_HEADER: string;
}

export const journalTrailerRepair: JournalTrailerRepairModule = createRequire(import.meta.url)(
  "../../../plugins/aidd-telemetry/hooks/lib/trailer-repair.cjs"
);
