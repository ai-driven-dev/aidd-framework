import { buildClosedIntervals, type ClosedInterval } from "./journal-intervals.js";
import type {
  RunJournal,
  RunJournalBoundary,
  RunJournalFileWritten,
  RunJournalStepStart,
  RunJournalTaskDeclared,
} from "./ports/run-journal-reader.js";

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
 * the next orchestrating `step_start` or a `turn_end` comes first, or - unclosed - the
 * journal's own last witnessed moment. Read from exactly the same journal a declared task
 * interval already reads (`task-attribution.ts`), one layer wider: no boundary is added for
 * this, and none is captured that was not captured already - see `phase-1.md`'s own "why an
 * axis, not a capture". A non-orchestrating `step_start` neither opens nor closes one of
 * these; it belongs to whichever flow interval its own moment already falls inside, or to
 * none at all. */
export interface FlowInterval extends ClosedInterval {
  readonly skill: string;
}

/**
 * Journal lines in, closed flow intervals out - the same merge and the same "journal's own
 * last witnessed moment" cap `buildTaskIntervals` uses, run through the one shared walk
 * (`buildClosedIntervals`) rather than a second copy of it. An orchestrating `step_start`
 * opens an interval; the next orchestrating `step_start` or a `turn_end` closes it; every
 * other boundary - a non-orchestrating `step_start`, a `file_written`, a `task_declared` -
 * neither opens nor closes one, and only ever contributes its own moment toward the
 * journal's last witnessed one for an interval a session crashed before closing.
 *
 * Two orchestrated runs of the very same skill in one session yield two distinct
 * `FlowInterval` objects here, never one merged by name: `cost-report.ts`'s own grouping
 * keys a record's flow membership on the interval it actually fell inside, by reference,
 * not on `skill` alone - the fact this function's own two-row acceptance criterion rests
 * on. Never open-ended, for the same reason `buildTaskIntervals` never is: no boundary
 * exposes when an orchestrating skill's own work finishes, so a boundless interval would
 * attribute everything a long-running session goes on to do afterward to the first
 * orchestrating step it ever saw.
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
    (boundary) => boundary.type === "turn_end",
    (opener, startMs, endMs) => ({ skill: opener.skill, startMs, endMs })
  );
}
