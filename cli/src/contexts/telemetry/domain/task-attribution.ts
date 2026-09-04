import { buildClosedIntervals, type ClosedInterval } from "./journal-intervals.js";
import type {
  RunJournal,
  RunJournalBoundary,
  RunJournalFileWritten,
  RunJournalTaskDeclared,
} from "./ports/run-journal-reader.js";
import { taskIdentityFromWrittenPath } from "./task-identity.js";

/** How a record's task came to be known. A declaration is a flow telling the journal which
 * ticket it is on; an inference is this layer noticing a written file on its own - the same
 * ordering `StepAttributionSource` already gives a step, for the same reason. No
 * "unattributed" here: every record this type describes already matched a `--task` filter
 * through one of the two routes `taskMembershipFor` names - one that matched neither is
 * simply not in the report at all. */
export type TaskAttributionSource = "declared" | "inferred";

export const TASK_ATTRIBUTION_SOURCES: readonly TaskAttributionSource[] = ["declared", "inferred"];

/** One declared interval, closed by a later declaration - or, unclosed, by the journal's
 * own last recorded moment.
 *
 * **A `turn_end` stopped closing one on 2026-09-04.** It is a pause, not a change of
 * subject: a session declared a task at 05:59, paused at 06:02, and worked on that same
 * task for three more hours. Closed at the pause, 78% of that session read "before the next
 * task this session declares" while only 1.8% of its tokens truly preceded any declaration.
 * Measured again after: 20% attributed became 96%, and the residue matched a hand count of
 * the records before the first declaration, to the token.
 *
 * `turn_end` remains a *witness*, so an interval with nothing after it still ends at the
 * same moment it used to - the same number, for the honest reason. Never left open-ended the
 * way `StepInterval` is: no tool exposes when a flow leaves a ticket, so a boundless interval
 * would attribute everything a long-running session goes on to do to the first ticket it
 * ever named, for as long as it keeps running - the failure this type exists to refuse. */
export interface TaskInterval extends ClosedInterval {
  readonly path: string;
}

/**
 * Journal lines in, bounded intervals out. `boundaries`, `taskDeclarations` and
 * `filesWritten` are merged and sorted by their own moment into one list, then walked once:
 * each `task_declared` closes at the next declaration. Unclosed, it is capped at that
 * merged list's own last moment - a written file
 * included, never only the kinds an interval actually closes on - so a session that is
 * still running when a report is asked for, with a file written after its declaration and
 * no `turn_end` yet, is bounded by that write rather than collapsing to `[t, t)` and losing
 * everything after it. `RunJournalBoundary` itself carries no `file_written`: pairing one in
 * there would let it close a running *step* early (see `run-journal-reader.ts`), a risk this
 * merge never runs into because nothing below is treated as a closer at all. A session that crashes and produces no
 * further line at all still leaves nothing after the declaration itself to misattribute.
 *
 * Still never open-ended: widening the last-witnessed moment moves an unclosed interval's
 * end later, it never removes the cap. An interval closes at what the journal actually
 * witnessed, not at "still running" read as "forever" - no tool exposes when a flow leaves a
 * ticket, so a boundless interval would go on attributing a long-running session's every
 * later record to the first ticket it ever named.
 *
 * `timed()` only refuses a moment it cannot parse at all - it does not refuse one that
 * parses but is absurd, so a `file_written` line dated by clock skew or a damaged clock (say
 * `9999-12-31`) still counts as a witnessed moment and can widen `lastMs` to it. `periodEndMs`
 * exists to close that hole without a second, weaker notion of "too far in the future": no
 * record this reader could ever be asked to place falls past the report's own period end (the
 * sink itself never returns one), so capping the unclosed end there costs nothing a real
 * record could have used and removes everything a clock-skewed one could have won.
 *
 * A `task_declared` line whose `path` `taskIdentityFromWrittenPath` cannot turn into an
 * identity - a literal `..` path segment, say - still takes its place among `closers`: it
 * still closes whatever interval came before it, at its own moment, exactly like any other
 * declaration. It simply produces no `TaskInterval` of its own. The alternative - dropping
 * such a line from `closers` entirely - would let the *previous* interval run past the
 * moment this one was actually declared, silently widening it. This is not a defensive
 * branch with no evidence it fires: `task-declared.cjs`'s own gate is a scan over free-form
 * tool-call text, looser than `taskIdentityFromWrittenPath`, so a session really can declare
 * a path this reader refuses.
 */
export function buildTaskIntervals(
  journal: RunJournal,
  periodEndMs?: number
): readonly TaskInterval[] {
  return buildClosedIntervals<
    RunJournalBoundary | RunJournalTaskDeclared | RunJournalFileWritten,
    RunJournalTaskDeclared,
    TaskInterval
  >(
    [...journal.boundaries, ...journal.taskDeclarations, ...journal.filesWritten],
    periodEndMs,
    (boundary): boundary is RunJournalTaskDeclared => boundary.type === "task_declared",
    // Only a later declaration closes one. A `turn_end` is a pause, not a change of
    // subject — it stays a *witness*, so an interval with nothing after it still ends at
    // the same moment, for the honest reason. See this module's own doc comment.
    () => false,
    (opener, startMs, endMs) =>
      taskIdentityFromWrittenPath(opener.path) === null
        ? null
        : { path: opener.path, startMs, endMs }
  );
}

/** Why a record belongs to no task - the distinct facts a person acts on differently, and
 * no more than those. This function itself answers only the four that are facts about the
 * record; `"no-journal"`, the fact about the read, is decided by `declaredTaskKeyOf` before
 * this is ever called. Never called for a moment `momentFallsWithin`
 * already reads as covered; that caller already knows which interval and needs no reason for
 * what it found.
 *
 * - `"no-journal"`: no *usable* journal reached this record's session. Either none was read
 *   for it at all, or one was read and could not be used - `report-cost-use-case.ts` drops
 *   a journal whose `session_start` header is torn, since nothing then says which session
 *   its lines belong to, and that shape is real (the adapter's own "keeps a session's
 *   boundaries when its header line is torn" test produces it). "Usable" is the word this
 *   reason turns on: saying "no journal existed" would be false for the second case, which
 *   is the fault this reason exists to stop repeating one level down. Never produced by this
 *   function, which is only ever asked about a session whose journal was usable -
 *   `declaredTaskKeyOf` answers it before calling here, from the absence of an entry in its
 *   own per-session map. It belongs in
 *   this type all the same: it is one of the reasons a `by_task` row carries, and keeping it
 *   in the same closed set is what makes `Record<TaskUnattributedReason, string>` force
 *   every consumer to name it. The four below are facts about the record itself; this one is
 *   a fact about the read, and merging it into `"no-declaration"` asserted that a session declared
 *   nothing when the truth was that its journal was never found - measured on 2026-09-04,
 *   where running the report from a subdirectory reported 100% "no usable task declaration"
 *   for a period whose journals were all present one directory up.
 * - `"no-declaration"`: this session's journal yields no usable declared interval - either it
 *   never wrote a `task_declared` line at all, or it wrote one this reader cannot place in
 *   time (an `at` `timed()` cannot parse, dropped before it ever reaches `buildTaskIntervals`).
 *   The two are indistinguishable from here, which is why this reason is worded "no usable
 *   declaration" rather than "none was ever declared" - the latter would be false for a
 *   session whose journal really does hold a line, just not a readable one.
 * - `"precedes-journal"`: this record's moment is older than the earliest moment its
 *   session's journal witnessed. Nothing was declared late here; no journal existed yet.
 *   The population is large and it is not an anomaly: reading a resumed transcript stores
 *   the turns it inherited under the session that read them, dated when each was *billed* -
 *   days before that session ever started. Measured on 2026-09-04, 96.2% of a real period
 *   fell here and read `"precedes-declaration"`, which told a person their flow declares its
 *   task late in 96% of cases when fewer than one in five hundred of those records actually
 *   did. Separated for the same reason `"no-journal"` was separated from `"no-declaration"`:
 *   a fact about what the journal could cover is not a fact about how the work behaved.
 *   Decided before `"no-declaration"`, so a journal that declared nothing *and* did not cover
 *   the record is named by the coverage fact - the one that explains why no declaration
 *   could have covered it. Keyed on the journal's own earliest witnessed moment, never on
 *   its `session_start` line, which would be a second notion of when a session began.
 * - `"precedes-declaration"`: a task was declared, but some declared interval starts *after*
 *   this moment. Since 2026-09-04 that means one thing only — a record before the session's
 *   very first declaration. Intervals now run contiguously from each declaration to the
 *   next, so the gap a `turn_end` used to leave between two of them no longer exists, and
 *   the test that described it was deleted rather than reworded. Since the reason above
 *   joined it, this is only ever a record the journal did witness: a genuinely late
 *   declaration, which is what the words say.
 * - `"journal-silent"`: a task was declared, every declared interval starts at or before this
 *   moment, and still none of them reaches it - the journal's own declared coverage ran out
 *   before this record's moment did. A record with no moment at all, or an unparseable one,
 *   reads the same way: nothing here can place it inside coverage the journal did offer, so
 *   it is as unplaceable as one that arrived after that coverage lapsed. In practice a
 *   report never hands this function such a record - `report-cost-use-case.ts` splits an
 *   undated record off before any of this runs - but the function stays correct standalone. */
export type TaskUnattributedReason =
  | "no-journal"
  | "precedes-journal"
  | "no-declaration"
  | "precedes-declaration"
  | "journal-silent";

/** Fixed and always in this order, the same reason `TASK_ATTRIBUTION_SOURCES` is: a reader
 * comparing two periods must find the reasons present listed the same way every time, never
 * ordered by how much of a period each accounted for. */
export const TASK_UNATTRIBUTED_REASONS: readonly TaskUnattributedReason[] = [
  "no-journal",
  "precedes-journal",
  "no-declaration",
  "precedes-declaration",
  "journal-silent",
];

/** `journalFirstWitnessedMs` is the earliest moment this session's journal witnessed, absent
 * for a journal that carries no readable moment at all. Absent means no coverage claim, never
 * a `0` that would place every record after it: a journal that witnessed nothing cannot
 * testify that a record predates it. */
export function taskUnattributedReason(
  intervals: readonly TaskInterval[],
  momentIso: string | undefined,
  journalFirstWitnessedMs?: number
): TaskUnattributedReason {
  const momentMs = momentIso === undefined ? Number.NaN : Date.parse(momentIso);
  if (
    !Number.isNaN(momentMs) &&
    journalFirstWitnessedMs !== undefined &&
    momentMs < journalFirstWitnessedMs
  ) {
    return "precedes-journal";
  }
  if (intervals.length === 0) return "no-declaration";
  if (Number.isNaN(momentMs)) return "journal-silent";
  const somethingDeclaredAfter = intervals.some((interval) => interval.startMs > momentMs);
  return somethingDeclaredAfter ? "precedes-declaration" : "journal-silent";
}
