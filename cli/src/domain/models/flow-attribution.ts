import type {
  RunJournal,
  RunJournalBoundary,
  RunJournalFileWritten,
  RunJournalStepStart,
  RunJournalTaskDeclared,
} from "../ports/run-journal-reader.js";
import {
  buildClosedIntervals,
  type ClosedInterval,
  type IntervalClosure,
} from "./journal-intervals.js";
import { namesTheSameSkill } from "./skill-name.js";

/**
 * Which skills open a flow when their own `step_start` fires - declared here, once, rather
 * than matched from a plugin name in passing.
 *
 * No skill's `SKILL.md` frontmatter says it orchestrates - `name`, `description` and
 * `argument-hint` are the whole of what it carries - and `aidd-orchestrator` alone holds
 * three skills that plausibly do (`00-async-dev`, `01-sdlc`, `02-backlog`). Matching the
 * plugin name itself as a string prefix would be exactly the tool-name branching this
 * repository already carries as a debt elsewhere (`host.cjs`, issue #683): a name that
 * happens to look right is not a declaration that it orchestrates. A declared set is the
 * one place this fact lives, and a project extending the framework with its own
 * orchestrator adds to this set and nothing else - no hook changes, no report code changes.
 *
 * Every skill below is named twice, deliberately, not by oversight: `skill-detection.cjs`
 * has two capture routes, and each writes a different spelling to the journal.
 * `skillNameFromArgument` (Claude Code, Copilot) hands over the host's own argument,
 * `aidd-orchestrator:01-sdlc`. `skillNameFromSkillFileRead` (Cursor, Codex) has no such
 * argument to read and falls back to the bare directory name a `SKILL.md` path names,
 * `01-sdlc` - `sanitizeSkillName` keeps `:` on the way to the journal, so neither spelling
 * is altered before it lands there. A set holding only the prefixed form would silently
 * open no flow at all on Cursor or Codex.
 *
 * The three bare names carry a real cost, stated rather than argued away: a skill of the
 * reader's own project named `00-async-dev`, `01-sdlc` or `02-backlog` opens a flow here,
 * and nothing in the journal separates it from the orchestrator's own. The limit is printed
 * with the figures - see `flowLimits` in `cost-report-artefact.ts` - because it cannot be
 * removed at an acceptable price. Qualifying the name at capture was measured and does not
 * work: the plugin directory sits at a different depth on every host, so no fixed offset
 * names it. Installed 2026-09-01 by `aidd setup`, for the one skill `01-sdlc`:
 *
 *   Claude Code  ~/.claude/plugins/cache/aidd-framework/aidd-orchestrator/2.2.1/skills/01-sdlc/
 *   Codex        ~/.codex/plugins/cache/aidd-framework/aidd-orchestrator/2.2.1/skills/01-sdlc/
 *   Cursor       ~/.cursor/plugins/local/aidd-orchestrator/skills/01-sdlc/
 *
 * Two segments above `skills/` on the first two, one on the third. An earlier version of
 * this comment claimed the bare names are "verified unique across every plugin's own
 * `skills/` directory in this framework", and concluded from it that they "never risk"
 * opening a flow on an unrelated skill. Both halves stand, and the conclusion does not
 * follow from them: this code runs against a reader's project, which is not the population
 * that was checked.
 *
 * OpenCode names no skill at all on any route (`opencode.cjs`'s own `stepStart: null` - the
 * same limit `bySteps` already lives with), so no third spelling exists to add.
 */
/** How a record's flow came to be known - the same three-way shape `by_step` carries, and
 * for the same reason: a flow an interval placed a record inside and one the record's own
 * tool named are two different claims, and merging them presents an inference as a
 * measurement.
 *
 * Narrower than `StepAttributionSource`, deliberately. `prompt-matched` resolves a step
 * from the prompt a `step_start` line was opened under, which names a step and never a
 * flow; carrying a value nothing here can produce would invite a consumer to handle a case
 * that cannot arise. */
export type FlowAttributionSource = "journal-interval" | "tool-stated" | "unattributed";

export const ORCHESTRATING_SKILLS: ReadonlySet<string> = new Set([
  "aidd-orchestrator:00-async-dev",
  "00-async-dev",
  "aidd-orchestrator:01-sdlc",
  "01-sdlc",
  "aidd-orchestrator:02-backlog",
  "02-backlog",
]);

/** The unqualified spellings among them - every entry carrying no `plugin:` prefix. These
 * are the ones a reader's own project can collide with, so these are the ones the flow axis
 * names when it states that limit (`flowLimits`, `cost-report-artefact.ts`).
 *
 * Derived rather than written out a second time. The set above promises that a project
 * adding its own orchestrator "adds to this set and nothing else - no hook changes, no
 * report code changes"; a sentence listing three names by hand would have broken that
 * promise the moment a fourth was added, and gone on printing three. Sorted so the sentence
 * reads the same on every run, whatever order the set was written in. */
export function bareOrchestratingSkillNames(
  skills: ReadonlySet<string> = ORCHESTRATING_SKILLS
): readonly string[] {
  return [...skills].filter((skill) => !skill.includes(":")).sort();
}

/** One closed flow interval: from an orchestrating skill's own `step_start` to whichever of
 * a `step_end` naming that same skill or the next orchestrating `step_start` comes first,
 * or - unclosed - the journal's own last witnessed moment.
 *
 * **A `turn_end` stopped closing one on 2026-09-04**, for the reason `task-attribution.ts`
 * already gives for a declared task: it is a pause, not the end of an orchestration. On the
 * one orchestrated session measured, the flow opened at 05:56:27, the first pause fell at
 * 06:02:34, and the same orchestration went on writing into the same task folder until
 * 09:27:21 - six minutes named against three and a half hours not. The step axis inside it
 * named 2,220 requests for the same skill while the flow, the wider concept, named 56. Read from exactly the same journal a declared task
 * interval already reads (`task-attribution.ts`), one layer wider: no boundary is added for
 * this, and none is captured that was not captured already - see `phase-1.md`'s own "why an
 * axis, not a capture". A non-orchestrating `step_start` neither opens nor closes one of
 * these; it belongs to whichever flow interval its own moment already falls inside, or to
 * none at all. */
export interface FlowInterval extends ClosedInterval {
  readonly skill: string;
  /** Whether `endMs` is a moment this journal witnessed or the cap standing in for one it
   * never did. Carried because `buildStepIntervals` composes these into the step axis and
   * reads it there; no flow row of its own is printed differently for it. */
  readonly closedBy: IntervalClosure;
}

/**
 * Journal lines in, closed flow intervals out - the same merge and the same "journal's own
 * last witnessed moment" cap `buildTaskIntervals` uses, run through the one shared walk
 * (`buildClosedIntervals`) rather than a second copy of it. An orchestrating `step_start`
 * opens an interval; a `step_end` naming that same skill, or the next orchestrating
 * `step_start`, closes it; every other boundary - a non-orchestrating `step_start`, a
 * `step_end` naming another skill, a `turn_end`, a `file_written`, a `task_declared` -
 * neither opens nor closes one, and only ever contributes its own moment toward the
 * journal's last witnessed one for an interval nothing ever closed.
 *
 * A `step_end` naming a *different* skill is never a closer, the same rule
 * `buildStepIntervals` follows: a step run inside the orchestration finishing is not the
 * orchestration finishing, and truncating there is exactly the fault naming the skill
 * exists to prevent. Only `aidd-dev:01-plan` emits the marker today, so most flows still
 * close on the next orchestrating `step_start` or the journal's own last witnessed moment;
 * that fallback is the cost of this rule, stated rather than hidden.
 *
 * Two orchestrated runs of the very same skill in one session yield two distinct
 * `FlowInterval` objects here, never one merged by name: `cost-report.ts`'s own grouping
 * keys a record's flow membership on the interval it actually fell inside, by reference,
 * not on `skill` alone - the fact this function's own two-row acceptance criterion rests
 * on. Never open-ended, for the same reason `buildTaskIntervals` never is: a journal that
 * ends without the orchestrating skill ever saying it was done exposes nothing about when
 * it finished, so a boundless interval would attribute everything a long-running session
 * goes on to do afterward to the first orchestrating step it ever saw.
 */
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
