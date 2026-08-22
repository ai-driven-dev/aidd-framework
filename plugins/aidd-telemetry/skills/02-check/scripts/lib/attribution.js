// Which step a record belongs to, and how strongly.

/** Strongest first, and fixed: a consumer finds the three in the same order every time. */
const SOURCES = ["tool-stated", "journal-interval", "unattributed"];

/**
 * A step covers the half-open interval from its own start to whichever boundary comes
 * next. No tool exposes when a skill's work finishes, so the end is always the next thing
 * that happened, never a duration the journal claimed.
 *
 * A boundary whose own moment cannot be read is dropped before any pairing, rather than
 * left in as a gap: left in, it would occupy an index while carrying no moment, and the
 * interval before it would inherit the moment of the boundary after it.
 */
function buildIntervals(journal) {
  const timed = journal.boundaries
    .map((boundary) => ({ boundary, atMs: Date.parse(boundary.at) }))
    .filter(({ atMs }) => !Number.isNaN(atMs));
  const intervals = [];
  for (const [index, { boundary, atMs }] of timed.entries()) {
    if (boundary.type !== "step_start") continue;
    const next = timed[index + 1];
    intervals.push({
      skill: boundary.skill,
      startMs: atMs,
      endMs: next ? next.atMs : Number.POSITIVE_INFINITY,
    });
  }
  return intervals;
}

/**
 * Where the tool named the step itself that is the answer, exact and never second-guessed
 * by an interval. Everything else falls back to the journal, joined on the record's own
 * moment. A record with no moment, or one earlier than every interval, is unattributed
 * rather than folded into the nearest step.
 */
function attribute(record, intervals) {
  if (record.step !== undefined) return { step_attribution: "tool-stated" };
  if (record.event_timestamp === undefined) return { step_attribution: "unattributed" };
  const ms = Date.parse(record.event_timestamp);
  if (Number.isNaN(ms)) return { step_attribution: "unattributed" };
  for (const interval of intervals) {
    if (ms >= interval.startMs && ms < interval.endMs) {
      return { step_attribution: "journal-interval", step: interval.skill };
    }
  }
  return { step_attribution: "unattributed" };
}

module.exports = { SOURCES, buildIntervals, attribute };
