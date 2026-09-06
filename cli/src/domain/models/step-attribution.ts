import type {
  RunJournal,
  RunJournalBoundary,
  RunJournalFileWritten,
  RunJournalStepStart,
  RunJournalTaskDeclared,
} from "../ports/run-journal-reader.js";
import { buildFlowIntervals, ORCHESTRATING_SKILLS } from "./flow-attribution.js";
import {
  buildClosedIntervals,
  type ClosedInterval,
  type IntervalClosure,
} from "./journal-intervals.js";
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
  /** Whether `endMs` is a moment the journal witnessed or the cap standing in for one it
   * never did - `answersFor` reads it, and it is the whole reason the cap above is safe to
   * apply. */
  readonly closedBy: IntervalClosure;
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
/** Every step a session opened that does not orchestrate - each closed by its own
 * `step_end`, by the next `step_start` whatever that one is, or by the journal's own last
 * witnessed moment. Two ordinary skills in a row are a sequence, so the second ends the
 * first; that reading is unchanged. */
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
    // `isOpener` already covers the non-orchestrating half; naming the whole rule here is
    // what keeps the orchestrating half from being an omission nobody wrote down.
    (boundary, opener) =>
      boundary.type === "step_start" ||
      (boundary.type === "step_end" && namesTheSameSkill(boundary.skill, opener.skill)),
    (opener, startMs, endMs, closedBy) => ({ skill: opener.skill, startMs, endMs, closedBy })
  );
}

/**
 * Journal lines in, closed intervals out - no filesystem, no record.
 *
 * **An invoked step no longer closes the orchestration that invoked it**, changed
 * 2026-09-05. Reading every `step_start` as the end of whatever was open assumes a session
 * only ever runs one skill after another, and an orchestrating skill's whole job is to
 * invoke others. Measured on the one orchestrated session captured, 2026-09-04:
 * `aidd-orchestrator:01-sdlc` opened at 05:56:27 and `aidd-pm:04-spec` at 05:59:53, so the
 * orchestration read as 206 seconds against a session that ran until 09:27:21 - which is
 * why this axis named 1 record for that skill while `by_flow`, reading the same journal
 * under the rule this now adopts, named 1,052.
 *
 * Which skills orchestrate is `ORCHESTRATING_SKILLS`'s declaration, never inferred from the
 * lines: nesting and sequence produce the identical journal, so no rule read off the
 * boundaries alone can separate them. That is also the limit - a skill that invokes another
 * without being declared an orchestrator is still read as a sequence, and is still cut short
 * by its own child.
 *
 * Built as two walks over the same lines rather than one with a branch inside it. The
 * orchestrating half **is** `buildFlowIntervals` - a flow is an orchestrating step, and
 * saying so by calling it is what keeps the two axes from drifting apart again.
 */
export function buildStepIntervals(
  journal: RunJournal,
  periodEndMs?: number
): readonly StepInterval[] {
  return [
    ...buildFlowIntervals(journal, periodEndMs),
    ...buildInvokedStepIntervals(journal, periodEndMs),
  ];
}

/** Where a record's own moment falls inside one interval, that interval's skill is the
 * attribution, marked as derived. A record with no moment, or one earlier than every
 * interval, is unattributed — never folded into the first step, which would assume work
 * began the instant a marker happened to be written rather than sometime before it. */
/** The most specific interval a moment falls in: the latest to have opened, and among
 * equals the first to close. An invoked step and the orchestration around it both contain
 * the moment, and both claims are true - the inner one is the one that says more, and the
 * outer one goes on answering for every moment the inner one does not cover. Order in the
 * array decides nothing: the two walks that build these run separately, so a rule that
 * read the first match would answer differently for the same journal depending on which
 * walk happened to run first. */
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

/** Whether an interval nothing closed sits inside another that nothing closed either.
 *
 * Every unclosed interval ends at the same moment - the journal's own last witnessed one,
 * capped identically for all of them - so containment between two of them reduces to which
 * opened first, and comparing the ends would be a clause no input can make false. The
 * enclosing one is the answer because the inner one's extent rests on no evidence at all,
 * while the enclosing one is at least still known to have been open at that moment. */
function enclosedByAnotherUnclosed(
  covering: readonly StepInterval[],
  interval: StepInterval
): boolean {
  if (interval.closedBy !== "journal-end") return false;
  return covering.some(
    (other) => other.closedBy === "journal-end" && other.startMs < interval.startMs
  );
}

/** The interval that answers for a moment.
 *
 * The innermost one covering it, *except* that an interval nothing ever closed yields to
 * one that encloses it and was never closed either. An unclosed interval ends at the
 * journal's own last witnessed moment, so its extent is a bound and not a measurement; a
 * step opened shortly before a long session goes on working would otherwise be credited
 * with all of it, purely for having opened later than the orchestration around it.
 * Measured on the one orchestrated session captured, 2026-09-04: 972 records attributed to
 * `aidd-dev:01-plan`, opened at 06:00:50 and never closed, inside an orchestration opened
 * at 05:56:27 and never closed either.
 *
 * Yielding is between two unclosed intervals and no wider. Where the enclosing interval
 * states its own end, the inner one runs past it and nothing encloses it, so the innermost
 * claim stands - the same answer it gets when both ends are witnessed. And an unclosed
 * interval that nothing encloses still answers: what is refused is preferring a bound over
 * a wider claim that covers the same moment, never the bound itself.
 *
 * No tie between two unclosed *sibling* steps can arise to be broken here, and it is not
 * this function that prevents it: any `step_start` closes whichever plain step was open, so
 * at most one invoked step is ever left unclosed at a time. */
function answersFor(
  intervals: readonly StepInterval[],
  momentMs: number
): StepInterval | undefined {
  const covering = intervals.filter(
    (interval) => momentMs >= interval.startMs && momentMs < interval.endMs
  );
  return innermostOf(covering.filter((interval) => !enclosedByAnotherUnclosed(covering, interval)));
}

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
