import type { RunJournal, RunJournalBoundary } from "../ports/run-journal-reader.js";

/** How a record's step came to be known. Never collapsed into one field with the step
 * name itself: a name the tool stated and one taken from an interval answer differently
 * when two skills interleave, and a consumer must be able to tell a measurement from an
 * inference. `unattributed` is a value returned here, never the caller's own omission —
 * an absent field would be read as "no step ran", which is the assertion nothing on a
 * transcript or a journal can support. */
export type StepAttributionSource = "tool-stated" | "journal-interval" | "unattributed";

export interface StepAttribution {
  readonly source: StepAttributionSource;
  readonly step?: string;
}

const UNATTRIBUTED: StepAttribution = { source: "unattributed" };

/** One `step_start`, closed by whichever boundary — another `step_start` or a `turn_end` —
 * comes next in file order, or left open if none does. `endMs` is exclusive, matching the
 * half-open interval #663 itself defines. */
export interface StepInterval {
  readonly skill: string;
  readonly startMs: number;
  readonly endMs: number;
}

interface TimedBoundary {
  readonly atMs: number;
  readonly boundary: RunJournalBoundary;
}

/** Drops a boundary whose own `at` cannot be parsed, before any pairing happens — never
 * leaving it in as a mid-list gap. Left in, an unparseable boundary would vanish from
 * `nextBoundaryMs`'s view while still occupying a list index, so the interval before it
 * would silently inherit the *next* boundary's moment as its own end, misattributing every
 * record in between to the wrong skill rather than reading them as unattributed. */
function parseableBoundaries(boundaries: readonly RunJournalBoundary[]): readonly TimedBoundary[] {
  const timed: TimedBoundary[] = [];
  for (const boundary of boundaries) {
    const atMs = Date.parse(boundary.at);
    if (!Number.isNaN(atMs)) timed.push({ atMs, boundary });
  }
  return timed;
}

/** Journal lines in, intervals out — no filesystem, no record. Two skills that interleave
 * (A, then B, then A) yield three intervals and two names, exactly as the boundaries
 * dictate; nothing here decides which record falls into which, that is `attributeMoment`'s
 * job, kept separate so an interval list can be built once per session and reused. */
export function buildStepIntervals(journal: RunJournal): readonly StepInterval[] {
  const timed = parseableBoundaries(journal.boundaries);
  const intervals: StepInterval[] = [];
  for (let i = 0; i < timed.length; i++) {
    const { atMs: startMs, boundary } = timed[i];
    if (boundary.type !== "step_start") continue;
    const endMs = timed[i + 1]?.atMs ?? Number.POSITIVE_INFINITY;
    intervals.push({ skill: boundary.skill, startMs, endMs });
  }
  return intervals;
}

/** Where a record's own moment falls inside one interval, that interval's skill is the
 * attribution, marked as derived. A record with no moment, or one earlier than every
 * interval, is unattributed — never folded into the first step, which would assume work
 * began the instant a marker happened to be written rather than sometime before it. */
export function attributeMoment(
  intervals: readonly StepInterval[],
  momentIso: string | undefined
): StepAttribution {
  if (momentIso === undefined) return UNATTRIBUTED;
  const momentMs = Date.parse(momentIso);
  if (Number.isNaN(momentMs)) return UNATTRIBUTED;
  const hit = intervals.find(
    (interval) => momentMs >= interval.startMs && momentMs < interval.endMs
  );
  return hit ? { source: "journal-interval", step: hit.skill } : UNATTRIBUTED;
}
