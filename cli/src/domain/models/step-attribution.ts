import type {
  RunJournal,
  RunJournalBoundary,
  RunJournalFileWritten,
  RunJournalStepStart,
  RunJournalTaskDeclared,
} from "../ports/run-journal-reader.js";
import { buildClosedIntervals, type ClosedInterval } from "./journal-intervals.js";
import { namesTheSameSkill } from "./skill-name.js";

/** How a record's step came to be known. Never collapsed into one field with the step
 * name itself: a name the tool stated and one taken from an interval answer differently
 * when two skills interleave, and a consumer must be able to tell a measurement from an
 * inference. `unattributed` is a value returned here, never the caller's own omission —
 * an absent field would be read as "no step ran", which is the assertion nothing on a
 * transcript or a journal can support. */
export type StepAttributionSource =
  | "tool-stated"
  | "prompt-matched"
  | "journal-interval"
  | "unattributed";

/** Strongest first, and fixed: a consumer reading a report should find the three in the
 * same order every time, whatever the records happened to contain. Ordering them by how
 * much of a period each accounted for would make the order itself a measurement, which is
 * the one thing a stable contract must not do. */
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
 * `step_start`, and - unclosed - by the journal's own last witnessed moment. `endMs` is
 * exclusive, matching the half-open interval the run journal itself defines.
 *
 * **A `turn_end` stopped closing one on 2026-09-05.** It is a pause, not the end of a
 * step, which is the rule `buildTaskIntervals` and `buildFlowIntervals` already read from
 * this very journal; a step spanning three prompts was being credited with its first turn
 * and nothing after. Measured on the one orchestrated session captured, 2026-09-04: four
 * steps opened across four hours of continuous work, every one of them closed by the next
 * pause, the last at 06:02:34 against a session that went on until 09:27:21. Of its 1,073
 * records, 69 fell inside a step interval; with a pause no longer closing one, 1,065 do.
 * The same journal already gave the flow axis 1,052 records and this axis 1 - two walks
 * over identical evidence disagreeing by three orders of magnitude, which is what this
 * change removes.
 *
 * **Capped rather than left open, which reverses the choice this comment used to pin.**
 * That choice rested on one premise: the cap "cannot be applied here" because this walk saw
 * `boundaries` alone, while a task or flow interval also saw `filesWritten` and
 * `taskDeclarations`, so it had later moments to cap at and this had none. The premise is
 * now false by construction - `buildStepIntervals` reads the same three arrays they do. All
 * that survives of it is the degenerate journal whose very last line is the opener, where
 * the cap does give a zero-width interval covering nothing. Open is not the safer error
 * there: one captured session carries a single `vendor_id` spanning 22 days, so
 * "everything the session does afterward" is three weeks of unrelated work.
 *
 * `aidd telemetry check`'s `records-join` claim was said to depend on the open reading, and
 * in that degenerate journal it genuinely does: `joinedVerdict` fails when *every* record is
 * unattributed, so a session whose journal holds the opener and nothing else, and whose
 * records carry no tool-stated step of their own, flips that claim from ok to fail. Found by
 * running it, not reasoned about - `diagnose-telemetry-use-case.unit.test.ts` held exactly
 * that journal. Failing there is the honest answer: nothing in such a journal says the step
 * was still running, and a claim reading ok on the strength of an unbounded interval was
 * asserting what it could not see. Every host that writes a pause is unaffected, which is
 * Claude Code, Cursor and OpenCode by `journal.cjs`'s own `HOOK_EVENT_NAME_TO_CANONICAL`. */
export interface StepInterval extends ClosedInterval {
  readonly skill: string;
}

/** Journal lines in, closed intervals out - no filesystem, no record. Run through the one
 * shared walk (`buildClosedIntervals`) rather than a second copy of it: this module used to
 * carry its own `timed`/`parseableBoundaries` pair and its own closer scan, which is how it
 * came to disagree with the two walks reading the same journal beside it.
 *
 * Any `step_start` opens an interval - unlike `buildFlowIntervals`, which opens one only
 * for a skill declared to orchestrate. A `step_end` naming that same skill closes it, by
 * `namesTheSameSkill` and never `===`: the host that opened the step may have written the
 * skill's bare directory name while the end the skill echoes carries its plugin. A
 * `step_end` naming a *different* skill is never a closer, which is the fault naming the
 * skill exists to prevent. Every other line - a `turn_end`, a `file_written`, a
 * `task_declared` - neither opens nor closes one, and only ever contributes its own moment
 * toward the journal's last witnessed one.
 *
 * Two runs of the very same skill in one session yield two distinct intervals, never one
 * merged by name, exactly as the boundaries dictate; nothing here decides which record
 * falls into which, that is `attributeMoment`'s job. */
export function buildStepIntervals(
  journal: RunJournal,
  periodEndMs?: number
): readonly StepInterval[] {
  return buildClosedIntervals<
    RunJournalBoundary | RunJournalTaskDeclared | RunJournalFileWritten,
    RunJournalStepStart,
    StepInterval
  >(
    [...journal.boundaries, ...journal.taskDeclarations, ...journal.filesWritten],
    periodEndMs,
    (boundary): boundary is RunJournalStepStart => boundary.type === "step_start",
    (boundary, opener) =>
      boundary.type === "step_end" && namesTheSameSkill(boundary.skill, opener.skill),
    (opener, startMs, endMs) => ({ skill: opener.skill, startMs, endMs })
  );
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
