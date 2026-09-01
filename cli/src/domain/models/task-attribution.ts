import type {
  RunJournal,
  RunJournalBoundary,
  RunJournalFileWritten,
  RunJournalTaskDeclared,
} from "../ports/run-journal-reader.js";
import { buildClosedIntervals, type ClosedInterval } from "./journal-intervals.js";
import { taskIdentityFromWrittenPath } from "./task-identity.js";

// Re-exported so this module's own callers and tests need not know the shared walk lives
// in `journal-intervals.ts` at all - `momentFallsWithin` is generic over `ClosedInterval`,
// which `TaskInterval` already satisfies structurally.
export { momentFallsWithin } from "./journal-intervals.js";

/** How a record's task came to be known. A declaration is a flow telling the journal which
 * ticket it is on; an inference is this layer noticing a written file on its own - the same
 * ordering `StepAttributionSource` already gives a step, for the same reason. No
 * "unattributed" here: every record this type describes already matched a `--task` filter
 * through one of the two routes `taskMembershipFor` names - one that matched neither is
 * simply not in the report at all. */
export type TaskAttributionSource = "declared" | "inferred";

export const TASK_ATTRIBUTION_SOURCES: readonly TaskAttributionSource[] = ["declared", "inferred"];

/** One declared interval, closed by whichever of a later declaration or a `turn_end` comes
 * next - or, unclosed, by the journal's own last recorded moment. Never left open-ended the
 * way `StepInterval` is: no tool exposes when a flow leaves a ticket, so a boundless interval
 * would attribute everything a long-running session goes on to do to the first ticket it
 * ever named, for as long as it keeps running - the failure this type exists to refuse. */
export interface TaskInterval extends ClosedInterval {
  readonly path: string;
}

/**
 * Journal lines in, bounded intervals out. `boundaries`, `taskDeclarations` and
 * `filesWritten` are merged and sorted by their own moment into one list, then walked once:
 * each `task_declared` closes at whichever of a later declaration or a `turn_end` comes
 * next. Unclosed, it is capped at that merged list's own last moment - a written file
 * included, never only the kinds an interval actually closes on - so a session that is
 * still running when a report is asked for, with a file written after its declaration and
 * no `turn_end` yet, is bounded by that write rather than collapsing to `[t, t)` and losing
 * everything after it. `RunJournalBoundary` itself carries no `file_written`: pairing one in
 * there would let it close a running *step* early (see `run-journal-reader.ts`), a risk this
 * merge never runs into because `closers` below is filtered to `task_declared` and
 * `turn_end` regardless of what else this list holds. A session that crashes and produces no
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
    (boundary) => boundary.type === "turn_end",
    (opener, startMs, endMs) =>
      taskIdentityFromWrittenPath(opener.path) === null
        ? null
        : { path: opener.path, startMs, endMs }
  );
}

/** Why a record's own moment falls in none of `intervals` - the three, and only three,
 * distinct facts a person acts on differently. Never called for a moment `momentFallsWithin`
 * already reads as covered; that caller already knows which interval and needs no reason for
 * what it found.
 *
 * - `"no-declaration"`: this session's journal yields no usable declared interval - either it
 *   never wrote a `task_declared` line at all, or it wrote one this reader cannot place in
 *   time (an `at` `timed()` cannot parse, dropped before it ever reaches `buildTaskIntervals`).
 *   The two are indistinguishable from here, which is why this reason is worded "no usable
 *   declaration" rather than "none was ever declared" - the latter would be false for a
 *   session whose journal really does hold a line, just not a readable one.
 * - `"precedes-declaration"`: a task was declared, but some declared interval starts *after*
 *   this moment - true both for a record before the session's very first declaration and for
 *   one landing in the gap a `turn_end` leaves between two declarations, which is a real gap
 *   in coverage, never the journal falling silent (the journal keeps going right through it).
 * - `"journal-silent"`: a task was declared, every declared interval starts at or before this
 *   moment, and still none of them reaches it - the journal's own declared coverage ran out
 *   before this record's moment did. A record with no moment at all, or an unparseable one,
 *   reads the same way: nothing here can place it inside coverage the journal did offer, so
 *   it is as unplaceable as one that arrived after that coverage lapsed. In practice a
 *   report never hands this function such a record - `report-cost-use-case.ts` splits an
 *   undated record off before any of this runs - but the function stays correct standalone. */
export type TaskUnattributedReason = "no-declaration" | "precedes-declaration" | "journal-silent";

/** Fixed and always in this order, the same reason `TASK_ATTRIBUTION_SOURCES` is: a reader
 * comparing two periods must find the reasons present listed the same way every time, never
 * ordered by how much of a period each accounted for. */
export const TASK_UNATTRIBUTED_REASONS: readonly TaskUnattributedReason[] = [
  "no-declaration",
  "precedes-declaration",
  "journal-silent",
];

export function taskUnattributedReason(
  intervals: readonly TaskInterval[],
  momentIso: string | undefined
): TaskUnattributedReason {
  if (intervals.length === 0) return "no-declaration";
  const momentMs = momentIso === undefined ? Number.NaN : Date.parse(momentIso);
  if (Number.isNaN(momentMs)) return "journal-silent";
  const somethingDeclaredAfter = intervals.some((interval) => interval.startMs > momentMs);
  return somethingDeclaredAfter ? "precedes-declaration" : "journal-silent";
}
