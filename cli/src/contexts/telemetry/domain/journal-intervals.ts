/** The one walk that turns run-journal lines into closed intervals, shared by
 * `task-attribution.ts` and `flow-attribution.ts`: they differ only in opener, closer and
 * payload. */

/** One boundary-like value, paired with the millisecond moment its own `at` parses to. */
export interface TimedBoundary<T> {
  readonly atMs: number;
  readonly boundary: T;
}

/** Every `at`-bearing value, timed and sorted, dropping one whose own `at` cannot be parsed.
 * Left in, it would occupy a list index while showing nothing, widening the interval before it. */
export function timed<T extends { readonly at: string }>(
  boundaries: readonly T[]
): readonly TimedBoundary<T>[] {
  return boundaries
    .map((boundary) => ({ atMs: Date.parse(boundary.at), boundary }))
    .filter(({ atMs }) => !Number.isNaN(atMs))
    .sort((left, right) => left.atMs - right.atMs);
}

/** The journal's own last recorded moment, capped at `periodEndMs` when one is given, so a
 * clock-skewed far-future moment never widens an unclosed interval past what a report could
 * place a record in. `timed()` refuses only what it cannot parse; this refuses the absurd. */
function cappedLastMoment(witnessedLastMs: number, periodEndMs: number | undefined): number {
  return periodEndMs === undefined ? witnessedLastMs : Math.min(witnessedLastMs, periodEndMs);
}

/** What ended an interval: a moment the journal witnessed, or the `journal-end` cap standing in
 * for one it never did. The distinction is a caller's to act on - a capped end is a bound, not
 * a measured extent. Two values and not three: no caller separates "closed by its own
 * `step_end`" from "closed by a later opener", both being moments the journal witnessed. */
export type IntervalClosure = "boundary" | "journal-end";

/** The two facts every closed interval this module builds needs — `path` (`TaskInterval`) or
 * `skill` (`FlowInterval`) rides beside these, never inside this shape itself. */
export interface ClosedInterval {
  readonly startMs: number;
  readonly endMs: number;
}

/** Whether a record's own moment falls inside one of `intervals` - never true for a record with
 * no moment, or one earlier than every interval, which keeps an interval from being read
 * backward onto work that happened before it ever opened. */
export function momentFallsWithin(
  intervals: readonly ClosedInterval[],
  momentIso: string | undefined
): boolean {
  if (momentIso === undefined) return false;
  const momentMs = Date.parse(momentIso);
  if (Number.isNaN(momentMs)) return false;
  return intervals.some((interval) => momentMs >= interval.startMs && momentMs < interval.endMs);
}

/** Journal lines in, closed intervals out - the one walk `buildTaskIntervals` and
 * `buildFlowIntervals` both run. `isCloser` is asked about the opener as well as the candidate,
 * and an interval ends at the first later boundary either predicate accepts, never at the first
 * `isCloser`. `toInterval` may answer `null` to close an interval without emitting a row. */
export function buildClosedIntervals<
  TBoundary extends { readonly at: string },
  TOpener extends TBoundary,
  TInterval,
>(
  boundaryLike: readonly TBoundary[],
  periodEndMs: number | undefined,
  isOpener: (boundary: TBoundary) => boundary is TOpener,
  isCloser: (boundary: TBoundary, opener: TOpener) => boolean,
  toInterval: (
    opener: TOpener,
    startMs: number,
    endMs: number,
    closedBy: IntervalClosure
  ) => TInterval | null
): readonly TInterval[] {
  const everyWitnessedMoment = timed(boundaryLike);
  // Not one readable moment in the whole journal: no interval either. Returning here is also
  // what makes `lastMs` a moment rather than a maybe-moment for the rest of this function.
  if (everyWitnessedMoment.length === 0) return [];
  const lastMs = cappedLastMoment(
    everyWitnessedMoment[everyWitnessedMoment.length - 1].atMs,
    periodEndMs
  );
  const intervals: TInterval[] = [];
  for (let i = 0; i < everyWitnessedMoment.length; i++) {
    const { atMs: startMs, boundary } = everyWitnessedMoment[i];
    if (!isOpener(boundary)) continue;
    const closerMs = firstCloserAfter(everyWitnessedMoment, i, boundary, isOpener, isCloser);
    const interval =
      closerMs === undefined
        ? toInterval(boundary, startMs, lastMs, "journal-end")
        : toInterval(boundary, startMs, closerMs, "boundary");
    if (interval !== null) intervals.push(interval);
  }
  return intervals;
}

/** The moment the interval opened at `from` ends, or `undefined` when nothing closes it.
 * Scanned forward rather than pre-filtered because `isCloser` is asked about the pair: a
 * `step_end` closes the flow whose skill it names and no other. */
function firstCloserAfter<TBoundary extends { readonly at: string }, TOpener extends TBoundary>(
  everyWitnessedMoment: readonly TimedBoundary<TBoundary>[],
  from: number,
  opener: TOpener,
  isOpener: (boundary: TBoundary) => boundary is TOpener,
  isCloser: (boundary: TBoundary, opener: TOpener) => boolean
): number | undefined {
  for (let i = from + 1; i < everyWitnessedMoment.length; i++) {
    const { atMs, boundary } = everyWitnessedMoment[i];
    if (isOpener(boundary) || isCloser(boundary, opener)) return atMs;
  }
  return undefined;
}
