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

/** How a record's flow came to be known - a flow an interval placed a record inside and one
 * the record's own tool named are different claims. Narrower than `StepAttributionSource`
 * deliberately: `prompt-matched` names a step and never a flow, so nothing here produces it. */
export type FlowAttributionSource = "journal-interval" | "tool-stated" | "unattributed";

/** Which skills open a flow when their own `step_start` fires - declared, never matched from a
 * plugin name. Each is named twice because `skill-detection.cjs`'s two capture routes write
 * `aidd-orchestrator:01-sdlc` (Claude Code, Copilot) and the bare `SKILL.md` directory name
 * (Cursor, Codex); the prefixed form alone opens no flow there, and a bare one can collide. */
export const ORCHESTRATING_SKILLS: ReadonlySet<string> = new Set([
  "aidd-orchestrator:00-async-dev",
  "00-async-dev",
  "aidd-orchestrator:01-sdlc",
  "01-sdlc",
  "aidd-orchestrator:02-backlog",
  "02-backlog",
]);

/** The unqualified spellings among them - the ones a reader's own project can collide with, so
 * the ones `flowLimits` names. Derived rather than listed by hand, which would go stale the
 * moment one is added. Sorted so the sentence reads the same on every run. */
export function bareOrchestratingSkillNames(
  skills: ReadonlySet<string> = ORCHESTRATING_SKILLS
): readonly string[] {
  return [...skills].filter((skill) => !skill.includes(":")).sort();
}

/** One closed flow interval: from an orchestrating skill's own `step_start` to whichever of a
 * `step_end` naming that same skill or the next orchestrating `step_start` comes first, or -
 * unclosed - the journal's own last witnessed moment. A `turn_end` is a pause and never closes
 * one; a non-orchestrating `step_start` neither opens nor closes one. */
export interface FlowInterval extends ClosedInterval {
  readonly skill: string;
  /** Whether `endMs` is a moment this journal witnessed or the cap standing in for one it
   * never did - carried because `buildStepIntervals` reads it in the step axis. */
  readonly closedBy: IntervalClosure;
}

/** Journal lines in, closed flow intervals out - the same merge and cap `buildTaskIntervals`
 * uses, through the one shared walk. A `step_end` naming a *different* skill is never a closer:
 * a step finishing inside the orchestration is not the orchestration finishing, and since only
 * `aidd-dev:01-plan` emits that marker, most flows close on the journal's end instead. */
export function buildFlowIntervals(
  journal: RunJournal,
  periodEndMs?: number
): readonly FlowInterval[] {
  return buildClosedIntervals<
    RunJournalBoundary | RunJournalTaskDeclared | RunJournalFileWritten,
    RunJournalStepStart,
    FlowInterval
  >(
    [...journal.boundaries, ...journal.taskDeclarations, ...journal.filesWritten],
    periodEndMs,
    (boundary): boundary is RunJournalStepStart =>
      boundary.type === "step_start" && ORCHESTRATING_SKILLS.has(boundary.skill),
    (boundary, opener) =>
      boundary.type === "step_end" && namesTheSameSkill(boundary.skill, opener.skill),
    (opener, startMs, endMs, closedBy) => ({ skill: opener.skill, startMs, endMs, closedBy })
  );
}
