/** One `step_start` line from a session's run journal: a step's own start and the skill
 * recorded for it. No end is carried — no tool measured so far exposes when a skill's work
 * finishes, so an interval's end is the reader's derivation, not a fact on this line. */
export interface RunJournalStepStart {
  readonly type: "step_start";
  readonly at: string;
  readonly skill: string;
  /** The host's own identifier for the prompt this step opened under, where it hands one to a
   * hook. Named `turn_id` on the line, but it is a prompt: several steps opened under one
   * share it. Matched against a record's `prompt_id` it attributes a step exactly, the only
   * reading that survives two tasks advancing at once. Absent for a host that hands its hooks
   * no such identifier. */
  readonly turn_id?: string;
}

/** One `turn_end` line: closes whatever step was open, even where no further step opens
 * before the turn itself ends. */
export interface RunJournalTurnEnd {
  readonly type: "turn_end";
  readonly at: string;
}

/** One `step_end` line: the moment a skill said its own work was over. No host emits this,
 * which is why the skill declares it. It closes only its own skill's open interval: closing
 * "whatever is open" would close the wrong one the moment a skill invokes another, and an end
 * naming a skill this session never started closes nothing rather than truncating. */
export interface RunJournalStepEnd {
  readonly type: "step_end";
  readonly at: string;
  readonly skill: string;
}

export type RunJournalBoundary = RunJournalStepStart | RunJournalTurnEnd | RunJournalStepEnd;

/** The `session_start` line: the one line naming what a session was. `tool` holds the journal
 * hook's own host identifier ("claude-code", "codex", "copilot", "cursor"), which is not an
 * `AiToolId` — `journalHostToAiToolId` is the only place the two are related, and it reads a
 * declaration rather than a table. */
export interface RunJournalSessionStart {
  readonly type: "session_start";
  readonly at: string;
  /** The schema the hook stamped this journal with, absent for one written before the field
   * existed. Read and carried, never derived: a reader inferring a schema from the shapes it
   * happens to recognise is the silent misreading this field exists to prevent. */
  readonly schema_version?: number;
  readonly run_id: string;
  readonly tool: string;
  readonly vendor_id: string;
  readonly project_id?: string;
  /** The git remote this session's repository resolved to, absent for one with none. Carried
   * beside `project_id` rather than replacing it. */
  readonly project_remote?: string;
  /** Git's own name for the linked worktree this session ran in, so two worktrees of one
   * repository are distinguishable. Absent — never `""` — for a plain checkout. */
  readonly worktree_id?: string;
  /** The repository those worktrees share, named from `--git-common-dir`. Recorded beside
   * `worktree_id` rather than left to `project_id`, which falls back to the worktree's own
   * directory name when a clone has no remote. Absent whenever `worktree_id` is. */
  readonly worktree_repo_id?: string;
  /** The plugin's own version at the moment this line was written - never the framework's,
   * and never the CLI's, which stamps only the record it stores. Absent reads as an unknown
   * version, never as a default or a guess. */
  readonly plugin_version?: string;
}

/** A `file_written` line: a repository-relative, "/"-separated path a session wrote inside a
 * task folder, and when. Carries no task identity — the hook refuses to store a derivation as
 * a fact, so deriving the task is the reader's job. */
export interface RunJournalFileWritten {
  readonly type: "file_written";
  readonly at: string;
  readonly path: string;
}

/** A `task_declared` line: a tool call named a file under a task folder, so this session is on
 * that task from here on — told rather than inferred. Carries no task identity for the reason
 * `file_written` does not. Deliberately outside `RunJournalBoundary`: an interval walk merges
 * it in as a moment the journal witnessed, never as a boundary that ends something, and the
 * type keeps the two apart so a later reader cannot confuse them. */
export interface RunJournalTaskDeclared {
  readonly type: "task_declared";
  readonly at: string;
  readonly path: string;
}

/** What the journal side promises a reader, for one session's run file, in file order — lines
 * read, nothing derived. Deriving intervals from `boundaries`, or a task from `filesWritten`,
 * is the reader's job. `session` is optional because a file whose first line is torn is still
 * worth its boundaries. */
export interface RunJournal {
  readonly boundaries: readonly RunJournalBoundary[];
  readonly session?: RunJournalSessionStart;
  readonly filesWritten: readonly RunJournalFileWritten[];
  readonly taskDeclarations: readonly RunJournalTaskDeclared[];
}

/**
 * The boundaries recorded for one session, or `null` when nothing can be said about it — no
 * run file, an unreadable runs directory, telemetry never enabled. Never throws: a missing,
 * unreadable or truncated journal costs attribution, not the read itself. Read-only on
 * purpose, so a caller that only reads cannot reach the verb that removes; one adapter
 * implements this and `RunJournalStore` below both.
 */
export interface RunJournalReader {
  read(sessionId: string): Promise<RunJournal | null>;
  /** Every session the journal holds, for a caller with no identifier to ask about. Filtering
   * to a period is the caller's, from each journal's own `session.at`: the run file's name
   * carries no date. Never throws; an unreadable runs directory answers an empty list. */
  list(): Promise<readonly RunJournal[]>;
  /** Every run file's own name, directly from the directory — never opened, never parsed.
   * Distinct from `list()`, which can silently drop a file it cannot parse: a caller counting
   * what removing this journal would touch needs a name a damaged file still has. Never
   * throws, the same failure direction as `list()`. */
  listRunFiles(): Promise<readonly string[]>;
  /** The schema stated by every journal this reader refused to read, one entry per file.
   * `list()` drops such a journal outright, and a caller shown only that emptiness would
   * report a torn file about one whose header it parsed perfectly well. Empty is the ordinary
   * answer. Never throws, like everything else here. */
  listForeignSchemas(): Promise<readonly number[]>;
}

/**
 * What removing a journal needs beyond a plain read — extends `RunJournalReader` rather than
 * sitting beside it, so the one adapter that resolves the runs directory implements one port.
 */
export interface RunJournalStore extends RunJournalReader {
  /** Where this project's run journal lives — the same directory `read`/`list` and
   * `listRunFiles` resolve, exposed so a caller naming the location never re-derives the
   * `AIDD_RUNS_DIR`-aware resolution itself. `deleteRunFile` below is handed back this value
   * rather than deriving its own. */
  readonly runsDir: string;
  /** Removes one run file, by the name `listRunFiles()` named it with, from `dir` — mirrors
   * `TelemetrySink.deleteDayFile`. `dir` is never resolved here: the caller passes the exact
   * directory a person was already shown, so a removal can never reach one the preview never
   * named. `fileName` must name exactly one entry directly inside `dir`; anything else,
   * including a relative walk out of it, is refused rather than deleted. A no-op, not a
   * failure, when the name is already gone. */
  deleteRunFile(dir: string, fileName: string): Promise<void>;
}
