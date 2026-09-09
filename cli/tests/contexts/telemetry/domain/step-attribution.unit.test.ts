import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RunJournal } from "../../../../src/contexts/telemetry/domain/ports/run-journal-reader.js";
import {
  attributeMoment,
  buildStepIntervals,
} from "../../../../src/contexts/telemetry/domain/step-attribution.js";

function journalOf(...boundaries: RunJournal["boundaries"]): RunJournal {
  return { boundaries, filesWritten: [], taskDeclarations: [] };
}

function journalWith(
  boundaries: RunJournal["boundaries"],
  filesWritten: RunJournal["filesWritten"]
): RunJournal {
  return { boundaries, filesWritten, taskDeclarations: [] };
}

const A_START = {
  type: "step_start",
  at: "2026-08-20T10:00:00Z",
  skill: "aidd-dev:02-implement",
} as const;
const B_START = {
  type: "step_start",
  at: "2026-08-20T10:05:00Z",
  skill: "aidd-dev:06-test",
} as const;
const A_AGAIN = {
  type: "step_start",
  at: "2026-08-20T10:10:00Z",
  skill: "aidd-dev:02-implement",
} as const;
const TURN_END = { type: "turn_end", at: "2026-08-20T10:15:00Z" } as const;

describe("step-attribution — pure: journal lines + records -> intervals", () => {
  it("maps a moment inside a step interval to that step, marked as derived", () => {
    const intervals = buildStepIntervals(journalOf(A_START, TURN_END));

    const attribution = attributeMoment(intervals, "2026-08-20T10:02:00Z");

    expect(attribution).toEqual({ source: "journal-interval", step: "aidd-dev:02-implement" });
  });

  // A `turn_end` is a pause, not the end of a step - the same rule `buildTaskIntervals` and
  // `buildFlowIntervals` already read from this very journal.
  it("runs a step past a pause, to the journal's own last witnessed moment", () => {
    const intervals = buildStepIntervals(
      journalWith(
        [A_START, TURN_END],
        [{ type: "file_written", at: "2026-08-20T11:00:00Z", path: "aidd_docs/note.md" }]
      )
    );

    expect(attributeMoment(intervals, "2026-08-20T10:30:00Z")).toEqual({
      source: "journal-interval",
      step: "aidd-dev:02-implement",
    });
    expect(intervals[0]?.endMs).toBe(Date.parse("2026-08-20T11:00:00Z"));
  });

  // No host emits when a skill's work finished (a `Skill` call's `tool_result` returns in a
  // tenth of a second), so the skill declares its own end, and that end outranks any pause.
  it("runs a step past every pause, to the end its own skill declared", () => {
    const intervals = buildStepIntervals(
      journalOf(
        A_START,
        TURN_END,
        { type: "turn_end", at: "2026-08-20T10:20:00Z" },
        { type: "step_end", at: "2026-08-20T10:30:00Z", skill: "aidd-dev:02-implement" }
      )
    );

    const attribution = attributeMoment(intervals, "2026-08-20T10:25:00Z");

    expect(attribution).toEqual({ source: "journal-interval", step: "aidd-dev:02-implement" });
  });

  // A skill invoking a second one leaves two open intervals; an end for the inner skill
  // must leave the outer one running.
  it("closes only the step its own skill names", () => {
    const intervals = buildStepIntervals(
      journalOf(A_START, B_START, {
        type: "step_end",
        at: "2026-08-20T10:07:00Z",
        skill: "aidd-dev:06-test",
      })
    );

    const outer = intervals.find((interval) => interval.skill === "aidd-dev:02-implement");
    const inner = intervals.find((interval) => interval.skill === "aidd-dev:06-test");
    expect(inner?.endMs).toBe(Date.parse("2026-08-20T10:07:00Z"));
    expect(outer?.endMs).toBe(Date.parse("2026-08-20T10:05:00Z"));
  });

  // Cursor and Codex name a skill by its folder alone, while the end a skill echoes always
  // carries the plugin: compared exactly, a declared end closes nothing on those hosts.
  it("closes a step opened by its bare name with the end its skill declares in full", () => {
    const bareStart = {
      type: "step_start",
      at: "2026-08-20T10:00:00Z",
      skill: "02-implement",
    } as const;
    const intervals = buildStepIntervals(
      journalOf(
        bareStart,
        { type: "turn_end", at: "2026-08-20T10:10:00Z" },
        { type: "step_end", at: "2026-08-20T10:30:00Z", skill: "aidd-dev:02-implement" }
      )
    );

    expect(intervals[0]?.endMs).toBe(Date.parse("2026-08-20T10:30:00Z"));
  });

  // The journal carries a moment later than the disagreeing end deliberately: with that end
  // as its last line, the assertion could not tell a refused closer from a cap.
  it("still refuses an end whose plugin disagrees with the one that opened the step", () => {
    const intervals = buildStepIntervals(
      journalWith(
        [A_START, { type: "step_end", at: "2026-08-20T10:02:00Z", skill: "aidd-pm:02-implement" }],
        [{ type: "file_written", at: "2026-08-20T10:20:00Z", path: "aidd_docs/note.md" }]
      )
    );

    expect(intervals[0]?.endMs).toBe(Date.parse("2026-08-20T10:20:00Z"));
  });

  // Read as a boundary all the same, it would truncate whatever interval was running - a
  // step it has no claim on.
  it("ignores an end for a skill this session never started", () => {
    const intervals = buildStepIntervals(
      journalWith(
        [A_START, { type: "step_end", at: "2026-08-20T10:02:00Z", skill: "some-other:skill" }],
        [{ type: "file_written", at: "2026-08-20T10:20:00Z", path: "aidd_docs/note.md" }]
      )
    );

    expect(attributeMoment(intervals, "2026-08-20T10:03:00Z")).toEqual({
      source: "journal-interval",
      step: "aidd-dev:02-implement",
    });
  });

  it("closes an interval at the next step_start, not at the turn's end past it", () => {
    const intervals = buildStepIntervals(journalOf(A_START, B_START, TURN_END));

    expect(attributeMoment(intervals, "2026-08-20T10:04:59Z")).toEqual({
      source: "journal-interval",
      step: "aidd-dev:02-implement",
    });
    expect(attributeMoment(intervals, "2026-08-20T10:05:00Z")).toEqual({
      source: "journal-interval",
      step: "aidd-dev:06-test",
    });
  });

  // A pause is not a closer, so what bounds the last step here is the journal's own last
  // witnessed moment - which this journal's `turn_end` happens to be.
  it("leaves nothing beyond the journal's last witnessed moment covered", () => {
    const intervals = buildStepIntervals(journalOf(B_START, TURN_END));

    expect(attributeMoment(intervals, "2026-08-20T10:14:59Z")).toMatchObject({
      source: "journal-interval",
    });
    expect(attributeMoment(intervals, "2026-08-20T10:15:00Z")).toEqual({
      source: "unattributed",
    });
  });

  it("yields three intervals and two names from A, then B, then A", () => {
    const intervals = buildStepIntervals(journalOf(A_START, B_START, A_AGAIN, TURN_END));

    expect(intervals).toHaveLength(3);
    expect(new Set(intervals.map((i) => i.skill))).toEqual(
      new Set(["aidd-dev:02-implement", "aidd-dev:06-test"])
    );
    expect(attributeMoment(intervals, "2026-08-20T10:05:30Z")).toEqual({
      source: "journal-interval",
      step: "aidd-dev:06-test",
    });
    expect(attributeMoment(intervals, "2026-08-20T10:12:00Z")).toEqual({
      source: "journal-interval",
      step: "aidd-dev:02-implement",
    });
  });

  it("reads a moment before the first boundary as unattributed, never folded into it", () => {
    const intervals = buildStepIntervals(journalOf(A_START, TURN_END));

    const attribution = attributeMoment(intervals, "2026-08-20T09:59:59Z");

    expect(attribution).toEqual({ source: "unattributed" });
  });

  it("reads a record with no moment at all as unattributed, never the first interval", () => {
    const intervals = buildStepIntervals(journalOf(A_START, TURN_END));

    expect(attributeMoment(intervals, undefined)).toEqual({ source: "unattributed" });
  });

  it("does not let an unparseable boundary extend the step before it into the step after", () => {
    const intervals = buildStepIntervals(
      journalOf(A_START, { type: "turn_end", at: "not-a-date" }, B_START, TURN_END)
    );

    const attribution = attributeMoment(intervals, "2026-08-20T10:07:00Z");

    expect(attribution).toEqual({ source: "journal-interval", step: "aidd-dev:06-test" });
  });

  it("reads every moment as unattributed when the journal opened no step", () => {
    const intervals = buildStepIntervals(journalOf(TURN_END));

    expect(attributeMoment(intervals, "2026-08-20T10:00:00Z")).toEqual({
      source: "unattributed",
    });
  });

  // `nowIso()` stamps at second resolution and the walk's sort is stable, so lines sharing
  // a moment keep file order: a step whose end shares its start's moment covers nothing.
  it("closes a step at an end sharing its own start's moment, covering nothing", () => {
    const intervals = buildStepIntervals(
      journalWith(
        [
          A_START,
          { type: "step_end", at: A_START.at, skill: A_START.skill },
          { type: "turn_end", at: "2026-08-20T11:00:00Z" },
        ],
        [{ type: "file_written", at: "2026-08-20T12:00:00Z", path: "aidd_docs/note.md" }]
      )
    );

    expect(intervals[0]?.endMs).toBe(Date.parse(A_START.at));
    expect(attributeMoment(intervals, A_START.at)).toEqual({ source: "unattributed" });
  });

  // Reading the invoked skill's own `step_start` as the end of the orchestration credits an
  // orchestration that ran for hours with the seconds before its first child.
  it("does not let an invoked step close the orchestration that invoked it", () => {
    const intervals = buildStepIntervals(
      journalOf(
        { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "aidd-orchestrator:01-sdlc" },
        { type: "step_start", at: "2026-08-20T10:05:00Z", skill: "aidd-pm:04-spec" },
        { type: "turn_end", at: "2026-08-20T11:00:00Z" }
      )
    );

    const sdlc = intervals.find((interval) => interval.skill === "aidd-orchestrator:01-sdlc");
    expect(sdlc?.endMs).toBe(Date.parse("2026-08-20T11:00:00Z"));
  });

  // The invoked step is inside the orchestration, not beside it, so both intervals contain
  // the same moment; the innermost answers, being the more specific claim.
  it("attributes a moment inside both to the step, and one outside it to the orchestration", () => {
    const intervals = buildStepIntervals(
      journalOf(
        { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "aidd-orchestrator:01-sdlc" },
        { type: "step_start", at: "2026-08-20T10:05:00Z", skill: "aidd-pm:04-spec" },
        { type: "step_end", at: "2026-08-20T10:10:00Z", skill: "aidd-pm:04-spec" },
        { type: "turn_end", at: "2026-08-20T11:00:00Z" }
      )
    );

    expect(attributeMoment(intervals, "2026-08-20T10:02:00Z")).toEqual({
      source: "journal-interval",
      step: "aidd-orchestrator:01-sdlc",
    });
    expect(attributeMoment(intervals, "2026-08-20T10:07:00Z")).toEqual({
      source: "journal-interval",
      step: "aidd-pm:04-spec",
    });
    // Past the invoked step's own declared end, back inside the orchestration alone.
    expect(attributeMoment(intervals, "2026-08-20T10:30:00Z")).toEqual({
      source: "journal-interval",
      step: "aidd-orchestrator:01-sdlc",
    });
  });

  // An interval nothing closed ends at the journal's last witnessed moment, a bound and not
  // a measurement, so where one sits inside another the enclosing one answers.
  it("hands a moment to the orchestration when nothing ever closed the step inside it", () => {
    const intervals = buildStepIntervals(
      journalOf(
        { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "aidd-orchestrator:01-sdlc" },
        { type: "step_start", at: "2026-08-20T10:05:00Z", skill: "aidd-pm:04-spec" },
        { type: "turn_end", at: "2026-08-20T11:00:00Z" }
      )
    );

    expect(attributeMoment(intervals, "2026-08-20T10:30:00Z")).toEqual({
      source: "journal-interval",
      step: "aidd-orchestrator:01-sdlc",
    });
  });

  // The first invoked step is closed by the second's own start, so its end is witnessed and
  // it answers for what it covers; only the second is unclosed, and it is the one that yields.
  it("keeps the earlier invoked step, and yields only the one nothing closed", () => {
    const intervals = buildStepIntervals(
      journalOf(
        { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "aidd-orchestrator:01-sdlc" },
        { type: "step_start", at: "2026-08-20T10:05:00Z", skill: "aidd-pm:04-spec" },
        { type: "step_start", at: "2026-08-20T10:20:00Z", skill: "aidd-dev:01-plan" },
        { type: "turn_end", at: "2026-08-20T11:00:00Z" }
      )
    );

    expect(attributeMoment(intervals, "2026-08-20T10:10:00Z")).toEqual({
      source: "journal-interval",
      step: "aidd-pm:04-spec",
    });
    expect(attributeMoment(intervals, "2026-08-20T10:30:00Z")).toEqual({
      source: "journal-interval",
      step: "aidd-orchestrator:01-sdlc",
    });
  });

  // The yielding is between two intervals nothing closed, and no wider: here the
  // orchestration states its own end, so the step inside runs past it and nothing encloses it.
  it("keeps the innermost step when the orchestration around it states its own end", () => {
    const intervals = buildStepIntervals(
      journalOf(
        { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "aidd-orchestrator:01-sdlc" },
        { type: "step_start", at: "2026-08-20T10:10:00Z", skill: "aidd-pm:04-spec" },
        { type: "step_end", at: "2026-08-20T10:20:00Z", skill: "aidd-orchestrator:01-sdlc" },
        { type: "turn_end", at: "2026-08-20T11:00:00Z" }
      )
    );

    expect(attributeMoment(intervals, "2026-08-20T10:15:00Z")).toEqual({
      source: "journal-interval",
      step: "aidd-pm:04-spec",
    });
  });

  // Nesting is declared, never inferred: only a skill `ORCHESTRATING_SKILLS` names invokes
  // others. Two ordinary skills in a row are a sequence, and the second still ends the first.
  it("still lets one ordinary step close another, which is a sequence and not a nesting", () => {
    const intervals = buildStepIntervals(journalOf(A_START, B_START, TURN_END));

    const first = intervals.find((interval) => interval.skill === A_START.skill);
    expect(first?.endMs).toBe(Date.parse(B_START.at));
  });

  // One orchestration does not nest inside another by default - the same rule
  // `buildFlowIntervals` already applies to the wider concept.
  it("lets one orchestration close another", () => {
    const intervals = buildStepIntervals(
      journalOf(
        { type: "step_start", at: "2026-08-20T10:00:00Z", skill: "aidd-orchestrator:01-sdlc" },
        { type: "step_start", at: "2026-08-20T10:05:00Z", skill: "aidd-orchestrator:02-backlog" },
        { type: "turn_end", at: "2026-08-20T11:00:00Z" }
      )
    );

    const first = intervals.find((interval) => interval.skill === "aidd-orchestrator:01-sdlc");
    expect(first?.endMs).toBe(Date.parse("2026-08-20T10:05:00Z"));
  });

  it("touches no filesystem — the module imports none of Node's fs APIs", () => {
    const url = new URL(
      "../../../../src/contexts/telemetry/domain/step-attribution.ts",
      import.meta.url
    );
    const source = readFileSync(fileURLToPath(url), "utf8");

    expect(source).not.toMatch(/from ["']node:fs/);
    expect(source).not.toMatch(/require\(["']node:fs/);
  });
});

describe("buildStepIntervals — a step the session never closed", () => {
  // An open interval is not the safer error: one captured session carries a single
  // `vendor_id` spanning 22 days, so "everything afterward" is three weeks of foreign work.
  it("caps a step nothing closed at the journal's own last witnessed moment", () => {
    const intervals = buildStepIntervals(
      journalWith(
        [{ type: "step_start", at: "2026-08-17T10:00:00Z", skill: "aidd-dev:01-plan" }],
        [{ type: "file_written", at: "2026-08-17T12:00:00Z", path: "aidd_docs/note.md" }]
      )
    );

    expect(intervals).toEqual([
      {
        skill: "aidd-dev:01-plan",
        startMs: Date.parse("2026-08-17T10:00:00Z"),
        endMs: Date.parse("2026-08-17T12:00:00Z"),
        closedBy: "journal-end",
      },
    ]);
    expect(attributeMoment(intervals, "2026-09-30T23:59:00Z")).toEqual({ source: "unattributed" });
  });

  // The price of the cap: a journal whose only line is the opener has no later moment to cap
  // at. `records-join` survives it - a record whose own tool named its step needs no interval.
  it("covers nothing when the opener is the only moment the journal ever witnessed", () => {
    const intervals = buildStepIntervals(
      journalOf({ type: "step_start", at: "2026-08-17T10:00:00Z", skill: "aidd-dev:01-plan" })
    );

    expect(intervals[0]?.endMs).toBe(Date.parse("2026-08-17T10:00:00Z"));
    expect(attributeMoment(intervals, "2026-08-17T10:00:01Z")).toEqual({
      source: "unattributed",
    });
  });
});
