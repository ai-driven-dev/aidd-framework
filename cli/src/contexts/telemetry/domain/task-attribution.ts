import { buildClosedIntervals, type ClosedInterval } from "./journal-intervals.js";
import type {
  RunJournal,
  RunJournalBoundary,
  RunJournalFileWritten,
  RunJournalTaskDeclared,
} from "./ports/run-journal-reader.js";
import { taskIdentityFromWrittenPath } from "./task-identity.js";

/** How a record's task came to be known: a flow declared it, or this layer inferred it from a
 * written file. No "unattributed": a record matching neither route `taskMembershipFor` names
 * is not in the report at all. */
export type TaskAttributionSource = "declared" | "inferred";

export const TASK_ATTRIBUTION_SOURCES: readonly TaskAttributionSource[] = ["declared", "inferred"];

/** One declared interval, closed by a later declaration - or, unclosed, capped at the
 * journal's own last recorded moment. A `turn_end` is a pause, not a change of subject: it
 * witnesses that moment but never closes. Never open-ended: no tool exposes when a flow leaves
 * a ticket, so a boundless interval would keep crediting the first ticket ever named. */
export interface TaskInterval extends ClosedInterval {
  readonly path: string;
}

/** Journal lines in, bounded intervals out; each `task_declared` closes at the next. Unclosed,
 * it is capped at the merged list's last moment, a written file included, never `[t, t)`, and
 * `periodEndMs` caps what a damaged clock could widen that to. A declaration whose `path`
 * resolves to no identity still closes the previous one, which would otherwise widen. */
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
    // Only a later declaration closes one: a `turn_end` witnesses its moment, it never ends
    // the subject.
    () => false,
    (opener, startMs, endMs) =>
      taskIdentityFromWrittenPath(opener.path) === null
        ? null
        : { path: opener.path, startMs, endMs }
  );
}

/** Why a record belongs to no task - one distinct fact per reason, each acted on differently.
 * `"no-journal"` is `taskRowOf`'s to answer, from its own map; the four below are this one's.
 *
 * - `"no-journal"`: no *usable* journal reached this session - none read, or one unusable.
 * - `"no-declaration"`: no usable declared interval - none written, or none placeable in time.
 * - `"precedes-journal"`: older than the journal's earliest moment, so nothing could cover it.
 * - `"precedes-declaration"`: a record before the session's very first declaration.
 * - `"journal-silent"`: declared coverage ran out before this moment; an undated record too. */
export type TaskUnattributedReason =
  | "no-journal"
  | "precedes-journal"
  | "no-declaration"
  | "precedes-declaration"
  | "journal-silent";

/** Fixed and always in this order, never ordered by how much of a period each accounted for,
 * so a reader comparing two periods finds the same list. */
export const TASK_UNATTRIBUTED_REASONS: readonly TaskUnattributedReason[] = [
  "no-journal",
  "precedes-journal",
  "no-declaration",
  "precedes-declaration",
  "journal-silent",
];

/** `journalFirstWitnessedMs` is the earliest moment this session's journal witnessed, absent
 * for one carrying no readable moment: absent is no coverage claim, never a `0`. */
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
