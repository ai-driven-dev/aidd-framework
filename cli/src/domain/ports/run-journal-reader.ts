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

/** What the journal side promises a reader: every `step_start` and `turn_end` line for one
 * session's run file, in file order — nothing else read, nothing derived. `session_start`
 * and `file_written` lines carry no boundary the interval logic needs, so they are not
 * surfaced here; deriving intervals from these boundaries is `domain/models/
 * step-attribution.ts`'s job, not this port's. */
export interface RunJournal {
  readonly boundaries: readonly RunJournalBoundary[];
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
}
