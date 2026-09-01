/** The one walk that turns run-journal lines into closed intervals - shared by
 * `task-attribution.ts`'s declared task intervals and `flow-attribution.ts`'s orchestrated
 * flow intervals, which differ only in what opens an interval, what else closes it, and
 * what payload the opener carries into the built interval. Pulled out once both needed the
 * identical merge-sort-walk shape: same three-array merge, same "journal's own last
 * witnessed moment" cap, same closer walk - duplicating it a second time is exactly what
 * this codebase's own duplication gate refuses. */

/** One boundary-like value, paired with the millisecond moment its own `at` parses to. */
export interface TimedBoundary<T> {
  readonly atMs: number;
  readonly boundary: T;
}

/** Every `at`-bearing value, timed and sorted - dropping one whose own `at` cannot be
 * parsed before any pairing happens, never leaving it in as a mid-list gap. Left in, an
 * unparseable boundary would vanish from a caller's view while still occupying a list
 * index, silently widening the interval before it. */
export function timed<T extends { readonly at: string }>(
  boundaries: readonly T[]
): readonly TimedBoundary<T>[] {
  return boundaries
    .map((boundary) => ({ atMs: Date.parse(boundary.at), boundary }))
    .filter(({ atMs }) => !Number.isNaN(atMs))
    .sort((left, right) => left.atMs - right.atMs);
}

/** The journal's own last recorded moment, capped at `periodEndMs` when one is given - so a
 * clock-skewed future moment (`file_written` dated `9999-12-31`, say) never widens an
 * unclosed interval past what a report could ever place a record in anyway. `timed()` only
 * refuses a moment it cannot parse at all; this is what refuses one that parses but is
 * absurd, without a second, weaker notion of "too far in the future". */
export function lastWitnessedMs(
  everyWitnessedMoment: readonly TimedBoundary<unknown>[],
  periodEndMs: number | undefined
): number | undefined {
  const witnessedLastMs =
    everyWitnessedMoment.length > 0
      ? everyWitnessedMoment[everyWitnessedMoment.length - 1].atMs
      : undefined;
  return witnessedLastMs === undefined || periodEndMs === undefined
    ? witnessedLastMs
    : Math.min(witnessedLastMs, periodEndMs);
}

/** The two facts every closed interval this module builds actually needs — `path`
 * (`TaskInterval`) or `skill` (`FlowInterval`) rides beside these, never inside this shape
 * itself. */
export interface ClosedInterval {
  readonly startMs: number;
  readonly endMs: number;
}

/** Whether a record's own moment falls inside one of `intervals` - never true for a record
 * with no moment, or one earlier than every interval, which is what keeps an interval from
 * being read backward onto work that happened before it ever opened. Generic over
 * `ClosedInterval` rather than either concrete interval shape, since the check itself
 * never reads `path` or `skill`. */
export function momentFallsWithin(
  intervals: readonly ClosedInterval[],
  momentIso: string | undefined
): boolean {
  if (momentIso === undefined) return false;
  const momentMs = Date.parse(momentIso);
  if (Number.isNaN(momentMs)) return false;
  return intervals.some((interval) => momentMs >= interval.startMs && momentMs < interval.endMs);
}

/**
 * Journal lines in, closed intervals out - the one walk both `buildTaskIntervals` and
 * `buildFlowIntervals` run. `boundaryLike` is the same three-array merge either caller
 * builds (`journal.boundaries`, `journal.taskDeclarations`, `journal.filesWritten`),
 * already carrying every moment either interval kind might need to cap an unclosed one at.
 *
 * `isOpener` names which boundary starts an interval; `isCloser` names every *other*
 * boundary that can end one early (a `task_declared` interval also closes on the next
 * `task_declared`, which `isOpener` already covers - `closers` below is `isOpener` union
 * `isCloser`, not `isCloser` alone). An opener the walk reaches with no later opener,
 * closer, or witnessed moment stays capped at its own start, never left open-ended: no
 * boundary here exposes when an interval's own work actually finishes, so an unbounded
 * interval would go on attributing everything a long-running session does afterward to the
 * first opener it ever saw.
 *
 * `toInterval` turns one opener plus its resolved bounds into the caller's own interval
 * shape, or `null` to close the interval without emitting a row for it -
 * `buildTaskIntervals` uses this to skip a declared path `taskIdentityFromWrittenPath`
 * cannot resolve while still letting it close whatever interval came before it;
 * `buildFlowIntervals` never returns `null`, since every orchestrating `step_start` names a
 * skill outright.
 */
export function buildClosedIntervals<
  TBoundary extends { readonly at: string },
  TOpener extends TBoundary,
  TInterval,
>(
  boundaryLike: readonly TBoundary[],
  periodEndMs: number | undefined,
  isOpener: (boundary: TBoundary) => boundary is TOpener,
  isCloser: (boundary: TBoundary) => boolean,
  toInterval: (opener: TOpener, startMs: number, endMs: number) => TInterval | null
): readonly TInterval[] {
  const everyWitnessedMoment = timed(boundaryLike);
  const lastMs = lastWitnessedMs(everyWitnessedMoment, periodEndMs);
  const closers = everyWitnessedMoment.filter(
    (entry) => isOpener(entry.boundary) || isCloser(entry.boundary)
  );
  const intervals: TInterval[] = [];
  for (let i = 0; i < closers.length; i++) {
    const { atMs: startMs, boundary } = closers[i];
    if (!isOpener(boundary)) continue;
    const endMs = closers[i + 1]?.atMs ?? lastMs ?? startMs;
    const interval = toInterval(boundary, startMs, endMs);
    if (interval !== null) intervals.push(interval);
  }
  return intervals;
}
