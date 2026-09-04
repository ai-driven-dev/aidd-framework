import type { RunJournal, RunJournalBoundary } from "../ports/run-journal-reader.js";
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

/** One `step_start`, closed by whichever boundary — another `step_start` or a `turn_end` —
 * comes next in file order, or left open if none does. `endMs` is exclusive, matching the
 * half-open interval the run journal itself defines.
 *
 * **Left open, unlike a task or a flow interval, and the difference is deliberate.**
 * `journal-intervals.ts` caps an unclosed task or flow at the journal's own last witnessed
 * moment, because leaving one open "would go on attributing everything a long-running
 * session does afterward to the first opener it ever saw". The same cap cannot be applied
 * here: those two walks see `filesWritten` and `taskDeclarations` as well as boundaries, so
 * there are later moments to cap at, while this one sees boundaries alone. The last
 * boundary of a session that never wrote `turn_end` *is* the open `step_start`, so capping
 * would give it a zero-width interval covering nothing — trading "attributes too much" for
 * "attributes nothing", which is not obviously the better error.
 *
 * A session ends without `turn_end` whenever its host fires no stop event; `journal.cjs`'s
 * own `HOOK_EVENT_NAME_TO_CANONICAL` maps one for Claude Code, Cursor and OpenCode, and
 * none for Copilot. So this is a live case, not a theoretical one, and
 * `aidd telemetry check`'s own `records-join` claim currently depends on the open reading —
 * change it and that claim starts failing for every unclosed session. Pinned by
 * `buildStepIntervals` tests below so the choice stays visible rather than incidental. */
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
/** Where a step that opened at `from` ends.
 *
 * A `step_end` naming this very skill wins over everything between, however many pauses that
 * is: it is the only line in the journal that states the end rather than standing in for it,
 * and a skill spanning three prompts is exactly the case a `turn_end` used to cut short.
 *
 * With no such line, the rule is the one this reader always had - the next `step_start` or
 * `turn_end`, or nothing. A `step_end` naming a *different* skill is never a closer here: it
 * would truncate a step it has no claim on, which is the fault naming the skill exists to
 * prevent. Same or different is `namesTheSameSkill`'s answer, not `===`: the host that
 * opened the step may have written the skill's bare directory name while the end the skill
 * echoes carries its plugin. */
function stepEndsAt(timed: readonly TimedBoundary[], from: number, skill: string): number {
  for (let i = from + 1; i < timed.length; i++) {
    const { boundary } = timed[i];
    if (boundary.type === "step_end" && namesTheSameSkill(boundary.skill, skill))
      return timed[i].atMs;
  }
  for (let i = from + 1; i < timed.length; i++) {
    if (timed[i].boundary.type !== "step_end") return timed[i].atMs;
  }
  return Number.POSITIVE_INFINITY;
}

export function buildStepIntervals(journal: RunJournal): readonly StepInterval[] {
  const timed = parseableBoundaries(journal.boundaries);
  const intervals: StepInterval[] = [];
  for (let i = 0; i < timed.length; i++) {
    const { atMs: startMs, boundary } = timed[i];
    if (boundary.type !== "step_start") continue;
    intervals.push({ skill: boundary.skill, startMs, endMs: stepEndsAt(timed, i, boundary.skill) });
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
