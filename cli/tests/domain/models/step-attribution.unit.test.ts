import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  attributeMoment,
  buildStepIntervals,
} from "../../../src/domain/models/step-attribution.js";
import type { RunJournal } from "../../../src/domain/ports/run-journal-reader.js";

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

  // A `turn_end` is a pause, not the end of a step - the rule `buildTaskIntervals` and
  // `buildFlowIntervals` already read from this very journal. Measured on the one
  // orchestrated session captured, 2026-09-04: four steps opened over four hours, every one
  // closed by the next pause, and 69 of the session's 1,073 records fell inside a step
  // interval. With a pause no longer closing one, 1,065 of them do.
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

  // A `turn_end` is a pause: a skill that spans three prompts is credited with its first
  // turn and nothing after. Nothing any host emits says when a skill's work finished -
  // measured, a `Skill` call's own `tool_result` returns in about a tenth of a second, which
  // is the dispatch - so the skill declares its own end and the hook writes it. Stated, the
  // end wins over every pause between it and the start.
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

  // An end names its skill so that closing one never closes another. A skill invoking a
  // second one leaves two open intervals; an end for the inner skill must leave the outer
  // one running.
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

  // Cursor and Codex name a skill by its folder alone - the plugin never reaches the journal
  // - while the end a skill echoes always carries the plugin, because that is what the skill
  // knows itself as. Compared exactly, a declared end closed nothing at all on those hosts.
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

  // The journal carries a later moment than the disagreeing end, deliberately: with the end
  // as its last line the interval would stop there anyway - at the journal's own last
  // witnessed moment - and the assertion could not tell a refused closer from a cap.
  it("still refuses an end whose plugin disagrees with the one that opened the step", () => {
    const intervals = buildStepIntervals(
      journalWith(
        [A_START, { type: "step_end", at: "2026-08-20T10:02:00Z", skill: "aidd-pm:02-implement" }],
        [{ type: "file_written", at: "2026-08-20T10:20:00Z", path: "aidd_docs/note.md" }]
      )
    );

    expect(intervals[0]?.endMs).toBe(Date.parse("2026-08-20T10:20:00Z"));
  });

  // An end for a skill that never started names nothing to close. Read as a boundary all the
  // same it would truncate whatever interval was running, which is a step it has no claim on.
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
  // witnessed moment - which this journal's `turn_end` happens to be. Same moment as the
  // old rule gave, reached for a different reason, so the boundary between covered and not
  // stays pinned either way.
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
    // A record in neither the first nor the third interval's own span.
    expect(attributeMoment(intervals, "2026-08-20T10:05:30Z")).toEqual({
      source: "journal-interval",
      step: "aidd-dev:06-test",
    });
    // A record after the third interval reopens, back in the first skill's name again.
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

  // A regression for a real bug caught in review: a boundary with an unparseable `at`
  // must not silently extend the *previous* step's interval past it, swallowing every
  // later step's own records under the wrong skill name.
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

  // The journal stamps every line with `nowIso()`, whose resolution is the second, so two
  // lines sharing a moment is the common case rather than a corner. The shared walk sorts
  // by moment, and a sort that is stable - as V8's is - leaves lines that share one in the
  // order they were read, which for two `boundaries` entries is file order. Pinned here
  // because that ordering is now inherited from the sort rather than written out, and a
  // step whose own end shares its start's moment must cover nothing rather than everything.
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

  // An orchestrating skill invokes others; that is what `ORCHESTRATING_SKILLS` declares it
  // does. Reading the invoked skill's own `step_start` as the end of the orchestration
  // credits an orchestration that ran for hours with the seconds before its first child.
  // Measured on the one orchestrated session captured, 2026-09-04: `aidd-orchestrator:01-sdlc`
  // opened at 05:56:27 and `aidd-pm:04-spec` opened at 05:59:53, so the orchestration was
  // read as 206 seconds long against a session that ran until 09:27:21. The flow axis, which
  // already refuses to let a non-orchestrating start close one, named 1,052 records for that
  // same skill while this axis named 1.
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
  // the same moment. The innermost is the one that answers: it is the more specific claim,
  // and the outer one is still true of it.
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

  // An interval nothing ever closed ends at the journal's own last witnessed moment, which
  // is a bound and not a measurement. Where one such interval sits inside another, the
  // enclosing one answers: the inner one's end says only that the journal stopped, while
  // the outer one is still known to have been open. Measured on the one orchestrated
  // session captured, 2026-09-04: `aidd-dev:01-plan` opened at 06:00:50 inside an
  // orchestration opened at 05:56:27, neither was ever closed, and reading the innermost
  // start alone credited the invoked step with every one of the 972 records written over
  // the three and a half hours that followed.
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

  // Two invoked steps in a row inside one orchestration. The first is closed by the
  // second's own start, so its end is a witnessed boundary and it answers for the moments
  // it covers; only the second is left unclosed, and it is the one that yields. There is
  // never a tie between two unclosed invoked steps to break, because a `step_start` closes
  // whichever plain step was open - which is what this case is here to demonstrate rather
  // than assert in a comment.
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

  // The yielding is between two intervals nothing closed, and no wider than that. Here the
  // orchestration states its own end while the step inside it does not, so the step runs
  // past it and no interval encloses it - the innermost claim stands, exactly as it does
  // when both ends are witnessed.
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
  // `buildFlowIntervals` already applies to the wider concept, read from the same lines.
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
    const url = new URL("../../../src/domain/models/step-attribution.ts", import.meta.url);
    const source = readFileSync(fileURLToPath(url), "utf8");

    expect(source).not.toMatch(/from ["']node:fs/);
    expect(source).not.toMatch(/require\(["']node:fs/);
  });
});

describe("buildStepIntervals — a step the session never closed", () => {
  // Capped, not left open, and the objection this used to carry is gone rather than
  // overruled: it said the cap "cannot be applied here" because this walk saw boundaries
  // alone while a task or flow interval also saw `filesWritten` and `taskDeclarations`.
  // This walk now reads the same three arrays they do, so the later moments it was said to
  // lack are the ones it caps at. What is left is the degenerate journal below - one whose
  // very last line is the opener - and there an open interval is not the safer error: one
  // captured session carries a single `vendor_id` spanning 22 days, so "everything
  // afterward" is three weeks of unrelated work, not a few minutes of it.
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
        // The cap, and named as one: nothing in this journal ever closed the step.
        closedBy: "journal-end",
      },
    ]);
    expect(attributeMoment(intervals, "2026-09-30T23:59:00Z")).toEqual({ source: "unattributed" });
  });

  // The price of the cap, stated rather than discovered later: a journal whose only line is
  // the opener has no later moment to cap at, so the interval covers nothing at all. A
  // session reaches this only by opening a skill and then writing no file, declaring no
  // task and firing no stop event - Copilot fires none, per `journal.cjs`'s own
  // `HOOK_EVENT_NAME_TO_CANONICAL`. `records-join` survives it: that claim fails only when
  // *every* record is unattributed, and a record whose own tool named its step is joined
  // without any interval at all.
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
