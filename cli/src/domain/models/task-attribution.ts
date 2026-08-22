import type {
  RunJournal,
  RunJournalBoundary,
  RunJournalTaskDeclared,
  RunJournalTurnEnd,
} from "../ports/run-journal-reader.js";

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
export interface TaskInterval {
  readonly path: string;
  readonly startMs: number;
  readonly endMs: number;
}

interface TimedBoundary<T> {
  readonly atMs: number;
  readonly boundary: T;
}

function timed<T extends { readonly at: string }>(
  boundaries: readonly T[]
): readonly TimedBoundary<T>[] {
  return boundaries
    .map((boundary) => ({ atMs: Date.parse(boundary.at), boundary }))
    .filter(({ atMs }) => !Number.isNaN(atMs))
    .sort((left, right) => left.atMs - right.atMs);
}

/**
 * Journal lines in, bounded intervals out. `boundaries` and `taskDeclarations` are merged
 * and sorted by their own moment, then walked once: each `task_declared` closes at whichever
 * of a later declaration or a `turn_end` comes next. Unclosed, it is capped at the *whole*
 * journal's own last recorded moment - step boundaries included, never only the two kinds an
 * interval closes on - so a crash right after a declaration, with a step_start still to
 * follow, is bounded by that step's own moment rather than reopening at Infinity. A session
 * that crashes and produces no further line at all leaves nothing after the declaration
 * itself to misattribute in the first place.
 */
export function buildTaskIntervals(journal: RunJournal): readonly TaskInterval[] {
  const everyBoundary = timed<RunJournalBoundary | RunJournalTaskDeclared>([
    ...journal.boundaries,
    ...journal.taskDeclarations,
  ]);
  const lastMs =
    everyBoundary.length > 0 ? everyBoundary[everyBoundary.length - 1].atMs : undefined;

  const closers = everyBoundary.filter(
    (entry): entry is TimedBoundary<RunJournalTaskDeclared | RunJournalTurnEnd> =>
      entry.boundary.type === "task_declared" || entry.boundary.type === "turn_end"
  );
  const intervals: TaskInterval[] = [];
  for (let i = 0; i < closers.length; i++) {
    const { atMs: startMs, boundary } = closers[i];
    if (boundary.type !== "task_declared") continue;
    const endMs = closers[i + 1]?.atMs ?? lastMs ?? startMs;
    intervals.push({ path: boundary.path, startMs, endMs });
  }
  return intervals;
}

/** Whether a record's own moment falls inside one of `intervals` - never true for a record
 * with no moment, or one earlier than every interval, which is what keeps a declaration from
 * being read backward onto work that happened before it was ever made. */
export function momentFallsWithin(
  intervals: readonly TaskInterval[],
  momentIso: string | undefined
): boolean {
  if (momentIso === undefined) return false;
  const momentMs = Date.parse(momentIso);
  if (Number.isNaN(momentMs)) return false;
  return intervals.some((interval) => momentMs >= interval.startMs && momentMs < interval.endMs);
}
