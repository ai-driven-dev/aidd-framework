import { buildFlowIntervals, ORCHESTRATING_SKILLS } from "./flow-attribution.js";
import {
  buildClosedIntervals,
  type ClosedInterval,
  type IntervalClosure,
} from "./journal-intervals.js";
import type {
  RunJournal,
  RunJournalBoundary,
  RunJournalFileWritten,
  RunJournalStepStart,
  RunJournalTaskDeclared,
} from "./ports/run-journal-reader.js";
import { namesTheSameSkill } from "./skill-name.js";

/** How a record's step came to be known: a name the tool stated and one taken from an interval
 * are different claims. `unattributed` is a value, never an absent field, which would read as
 * "no step ran" — an assertion no transcript or journal supports. */
export type StepAttributionSource =
  | "tool-stated"
  | "prompt-matched"
  | "journal-interval"
  | "unattributed";

/** Strongest first, and fixed: ordering them by how much of a period each accounted for
 * would make the order itself a measurement, which a stable contract must not do. */
export const STEP_ATTRIBUTION_SOURCES: readonly StepAttributionSource[] = [
  "tool-stated",
  "prompt-matched",
  "journal-interval",
  "unattributed",
];

export interface StepAttribution {
  readonly source: StepAttributionSource;
  readonly step?: string;
}

const UNATTRIBUTED: StepAttribution = { source: "unattributed" };

/** One `step_start`, closed by a `step_end` naming that same skill or by the next
 * `step_start`, and - unclosed - capped at the journal's own last witnessed moment; `endMs`
 * is exclusive. A `turn_end` is a pause, not the end of a step, and never closes one. Capped
 * rather than left open because one session's `vendor_id` can span weeks of unrelated work. */
export interface StepInterval extends ClosedInterval {
  readonly skill: string;
  /** Whether `endMs` is a moment the journal witnessed or the cap standing in for one it
   * never did - `answersFor` reads it, and it is why the cap above is safe to apply. */
  readonly closedBy: IntervalClosure;
}

/** Journal lines in, closed intervals out. An orchestrating skill's `step_start` is
 * `buildFlowIntervals`'s to open, not this walk's; a `step_end` matches its opener through
 * `namesTheSameSkill` and never `===`, since a host may write the skill's bare directory name
 * where the end the skill echoes carries its plugin. */
function buildInvokedStepIntervals(
  journal: RunJournal,
  periodEndMs: number | undefined
): readonly StepInterval[] {
  return buildClosedIntervals<
    RunJournalBoundary | RunJournalTaskDeclared | RunJournalFileWritten,
    RunJournalStepStart,
    StepInterval
  >(
    [...journal.boundaries, ...journal.taskDeclarations, ...journal.filesWritten],
    periodEndMs,
    (boundary): boundary is RunJournalStepStart =>
      boundary.type === "step_start" && !ORCHESTRATING_SKILLS.has(boundary.skill),
    // Any `step_start` closes one of these, an orchestrating one included: a session that
    // starts orchestrating is no longer running the plain skill it was running before.
    (boundary, opener) =>
      boundary.type === "step_start" ||
      (boundary.type === "step_end" && namesTheSameSkill(boundary.skill, opener.skill)),
    (opener, startMs, endMs, closedBy) => ({ skill: opener.skill, startMs, endMs, closedBy })
  );
}

/** Two walks over the same lines: the orchestrating half **is** `buildFlowIntervals`, so an
 * invoked step never closes the orchestration that invoked it. Which skills orchestrate is
 * `ORCHESTRATING_SKILLS`'s declaration - nesting and sequence produce the identical journal,
 * so nothing read off the boundaries alone can separate them. */
export function buildStepIntervals(
  journal: RunJournal,
  periodEndMs?: number
): readonly StepInterval[] {
  return [
    ...buildFlowIntervals(journal, periodEndMs),
    ...buildInvokedStepIntervals(journal, periodEndMs),
  ];
}

/** The most specific interval a moment falls in: the latest to have opened, and among equals
 * the first to close. Order in the array decides nothing - the two walks that build these run
 * separately, so reading the first match would answer differently per run order. */
function innermostOf(intervals: readonly StepInterval[]): StepInterval | undefined {
  let best: StepInterval | undefined;
  for (const interval of intervals) {
    if (
      best === undefined ||
      interval.startMs > best.startMs ||
      (interval.startMs === best.startMs && interval.endMs < best.endMs)
    ) {
      best = interval;
    }
  }
  return best;
}

/** Whether an interval nothing closed sits inside another that nothing closed either. Both end
 * at the same capped moment, so containment reduces to which opened first; the enclosing one
 * wins because the inner one's extent rests on no evidence at all. */
function enclosedByAnotherUnclosed(
  covering: readonly StepInterval[],
  interval: StepInterval
): boolean {
  if (interval.closedBy !== "journal-end") return false;
  return covering.some(
    (other) => other.closedBy === "journal-end" && other.startMs < interval.startMs
  );
}

/** The interval that answers for a moment: the innermost one covering it, *except* that an
 * interval nothing ever closed yields to one that encloses it and was never closed either. An
 * unclosed extent is a bound, not a measurement, so a step opened shortly before a long
 * session goes on working would otherwise be credited with all of it. */
function answersFor(
  intervals: readonly StepInterval[],
  momentMs: number
): StepInterval | undefined {
  const covering = intervals.filter(
    (interval) => momentMs >= interval.startMs && momentMs < interval.endMs
  );
  return innermostOf(covering.filter((interval) => !enclosedByAnotherUnclosed(covering, interval)));
}

/** A record's moment inside one interval takes that interval's skill. One with no moment, or
 * earlier than every interval, is unattributed — never folded into the first step. */
export function attributeMoment(
  intervals: readonly StepInterval[],
  momentIso: string | undefined
): StepAttribution {
  if (momentIso === undefined) return UNATTRIBUTED;
  const momentMs = Date.parse(momentIso);
  if (Number.isNaN(momentMs)) return UNATTRIBUTED;
  const hit = answersFor(intervals, momentMs);
  return hit ? { source: "journal-interval", step: hit.skill } : UNATTRIBUTED;
}
