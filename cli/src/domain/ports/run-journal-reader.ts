/** One `step_start` line from a session's run journal: a step's own start, and the
 * skill name recorded for it. Mirrors what `plugins/aidd-telemetry/hooks/lib/record.cjs`'s
 * `buildStepStartLine` writes. No end is ever carried — the journal was deliberately
 * written without one, since no tool measured so far exposes when a skill's work finishes;
 * an interval's end is the reader's own derivation, not a fact on this line. */
export interface RunJournalStepStart {
  readonly type: "step_start";
  readonly at: string;
  readonly skill: string;
}

/** One `turn_end` line: closes whatever step was open, even where no further step opens
 * before the turn itself ends. */
export interface RunJournalTurnEnd {
  readonly type: "turn_end";
  readonly at: string;
}

export type RunJournalBoundary = RunJournalStepStart | RunJournalTurnEnd;

/** The `session_start` line: the one line naming what a session was. `tool` holds the
 * journal hook's own host identifier ("claude-code", "codex", "copilot", "cursor"), which
 * is not an `AiToolId` — `journalHostToAiToolId` in `domain/tools/registry.ts` is the only
 * place the two are related, and it reads a declaration rather than a table. */
export interface RunJournalSessionStart {
  readonly type: "session_start";
  readonly at: string;
  readonly run_id: string;
  readonly tool: string;
  readonly vendor_id: string;
  readonly project_id?: string;
  /** The git remote this session's repository resolved to, absent for a repository with
   * none. Carried beside `project_id` rather than replacing it, the same shape
   * `record.cjs`'s own `session_start` line writes. */
  readonly project_remote?: string;
  /** Git's own name for the linked worktree this session ran in, so two worktrees
   * of one repository are distinguishable in a journal. Absent — never `""` — for a plain
   * checkout, which is the common case and is not an unknown worktree. */
  readonly worktree_id?: string;
  /** The repository those worktrees share, named from `--git-common-dir`. Recorded beside
   * `worktree_id` rather than left to `project_id`, which falls back to the worktree's own
   * directory name when a clone has no remote. Absent whenever `worktree_id` is. */
  readonly worktree_repo_id?: string;
  /** The plugin's own version, read from its manifest by `record.cjs`'s
   * `buildSessionStartLine` at the moment this line was written - never the framework's
   * version, and never the CLI's, which stamps only the record it stores, not the journal
   * line beside it (see `TelemetrySinkRecord.cli_version`). Absent for a line the hook
   * could not read its own manifest to stamp, and for any line written before this field
   * existed - either way reads as an unknown version, never as a default or a guess. */
  readonly plugin_version?: string;
}

/** A `file_written` line: a repository-relative, "/"-separated path a session wrote inside
 * a task folder, and when. Deliberately carries no task identity — the hook that writes it
 * refuses to store a derivation as a fact, so deriving the task is the reader's job. */
export interface RunJournalFileWritten {
  readonly type: "file_written";
  readonly at: string;
  readonly path: string;
}

/** A `task_declared` line: a tool call named a file under a task folder, so this session is
 * on that task from here on — told rather than inferred, the way `step_start` names a
 * skill. Carries no task identity for the same reason `file_written` does not: `path` is
 * the same repository-relative shape, and deriving the task from it is `task-identity.ts`'s
 * job. Deliberately kept out of `RunJournalBoundary` — pairing it into `boundaries` would
 * let it close a running step early (see `step-attribution.ts`'s `buildStepIntervals`), so
 * a task interval is built from this array plus `boundaries`' own `turn_end` lines instead,
 * in `domain/models/task-attribution.ts`. */
export interface RunJournalTaskDeclared {
  readonly type: "task_declared";
  readonly at: string;
  readonly path: string;
}

/** What the journal side promises a reader, for one session's run file, in file order —
 * lines read, nothing derived. Deriving intervals from `boundaries` is `domain/models/
 * step-attribution.ts`'s job; deriving a task from `filesWritten` is the cost report's.
 *
 * `boundaries` was once all of this: step attribution needed nothing else, and this port
 * said so. It is no longer the whole readership. A report has to know which tool and which
 * project a session belonged to, and which task it wrote into, and both facts are already
 * lines in the same file — so the exclusion was scoped to step attribution, never to the
 * journal as a source. `session` is optional because a file whose first line is torn is
 * still worth its boundaries. */
export interface RunJournal {
  readonly boundaries: readonly RunJournalBoundary[];
  readonly session?: RunJournalSessionStart;
  readonly filesWritten: readonly RunJournalFileWritten[];
  readonly taskDeclarations: readonly RunJournalTaskDeclared[];
}

/**
 * What a run-journal reader promises: the boundaries recorded for one session, or
 * `null` when nothing can be said about it — no run file for this session, an unreadable
 * runs directory, telemetry that was never enabled. Never throws: a missing, unreadable or
 * truncated journal costs attribution, not the read itself, so a session with no journal at
 * all yields the same figures it would without this port existing.
 *
 * Read-only on purpose: `diagnose-telemetry-use-case.ts`, `report-cost-use-case.ts` and
 * `read-local-cost-use-case.ts` each need to read a journal and none of them should be
 * handed something that can delete one. `RunJournalStore` below extends this the same way
 * `PersonIdentityStore` extends `PersonIdentityReader` — one adapter implements both, but a
 * caller that only reads is typed so it cannot reach for the verb that removes.
 */
export interface RunJournalReader {
  read(sessionId: string): Promise<RunJournal | null>;
  /** Every session the journal holds, for a caller that has no identifier to ask about —
   * a report covers a stretch of time, and the sessions inside it are what it is looking
   * for. Filtering to a period is the caller's, from each journal's own `session.at`: the
   * run file's name carries no date. Never throws, for the same reason `read` does not; a
   * missing or unreadable runs directory answers an empty list. */
  list(): Promise<readonly RunJournal[]>;
  /** Every run file's own name, directly from the directory — never opened, never
   * parsed. Distinct from `list()`, which reads and can silently drop a file it cannot
   * parse: a caller counting what removing this journal would touch needs a name a
   * damaged file still has, not a count that only survives files still readable. Never
   * throws; a missing or unreadable runs directory answers an empty list, the same
   * failure direction as `list()`. */
  listRunFiles(): Promise<readonly string[]>;
}

/**
 * What `ForgetTelemetryUseCase` needs beyond a plain read — extends `RunJournalReader`
 * rather than sitting beside it, so the one adapter that resolves the runs directory
 * implements exactly one port, the same shape `PersonIdentityStore` already uses over
 * `PersonIdentityReader`.
 */
export interface RunJournalStore extends RunJournalReader {
  /** Where this project's run journal lives — the same directory `read`/`list` and
   * `listRunFiles` resolve, exposed so a caller that only needs to name the location
   * (never open a file in it) has one place to ask, rather than re-deriving the same
   * `AIDD_RUNS_DIR`-aware resolution itself. This is also the value `ForgetTelemetryUseCase`
   * carries into `TelemetryRemovalPreview.journal.path` — `deleteRunFile` below never
   * re-derives it, it is handed back exactly what this named. */
  readonly runsDir: string;
  /** Removes one run file, by the name `listRunFiles()` named it with, from `dir` —
   * mirrors `TelemetrySink.deleteDayFile`. `dir` is never resolved inside this method: the
   * caller (`forget-telemetry-use-case.ts`) passes `TelemetryRemovalPreview.journal.path`,
   * the exact directory a person was already shown, so a removal can never reach a
   * directory the preview never named — see that value's own doc for why. `fileName` must
   * name exactly one entry directly inside `dir` (`isBareFileName`); anything else,
   * including a relative walk out of it, is refused rather than deleted. A no-op, not a
   * failure, when the name is already gone. */
  deleteRunFile(dir: string, fileName: string): Promise<void>;
}
