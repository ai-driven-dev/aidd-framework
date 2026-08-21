/** One `step_start` line from a session's run journal (#663): a step's own start, and the
 * skill name recorded for it. Mirrors what `plugins/aidd-telemetry/hooks/lib/record.js`'s
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
}

/** A `file_written` line: a repository-relative, "/"-separated path a session wrote inside
 * a task folder, and when. Deliberately carries no task identity — the hook that writes it
 * refuses to store a derivation as a fact, so deriving the task is the reader's job. */
export interface RunJournalFileWritten {
  readonly type: "file_written";
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
}

/**
 * What a run-journal reader promises: the boundaries #663 recorded for one session, or
 * `null` when nothing can be said about it — no run file for this session, an unreadable
 * runs directory, telemetry that was never enabled. Never throws: a missing, unreadable or
 * truncated journal costs attribution, not the read itself, so a session with no journal at
 * all yields the same figures it would without this port existing.
 */
export interface RunJournalReader {
  read(sessionId: string): Promise<RunJournal | null>;
  /** Every session the journal holds, for a caller that has no identifier to ask about —
   * a report covers a stretch of time, and the sessions inside it are what it is looking
   * for. Filtering to a period is the caller's, from each journal's own `session.at`: the
   * run file's name carries no date. Never throws, for the same reason `read` does not; a
   * missing or unreadable runs directory answers an empty list. */
  list(): Promise<readonly RunJournal[]>;
}
