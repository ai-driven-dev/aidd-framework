import { describe, expect, it } from "vitest";
import {
  bareOrchestratingSkillNames,
  buildFlowIntervals,
  ORCHESTRATING_SKILLS,
} from "../../../src/domain/models/flow-attribution.js";
import { momentFallsWithin } from "../../../src/domain/models/journal-intervals.js";
import type { RunJournal } from "../../../src/domain/ports/run-journal-reader.js";

function journalOf(
  boundaries: RunJournal["boundaries"],
  taskDeclarations: RunJournal["taskDeclarations"] = [],
  filesWritten: RunJournal["filesWritten"] = []
): RunJournal {
  return { boundaries, filesWritten, taskDeclarations };
}

const SDLC_OPENS = {
  type: "step_start",
  at: "2026-08-17T10:00:00Z",
  skill: "aidd-orchestrator:01-sdlc",
} as const;
const BACKLOG_OPENS = {
  type: "step_start",
  at: "2026-08-17T11:00:00Z",
  skill: "aidd-orchestrator:02-backlog",
} as const;
const HAND_RUN_STEP = {
  type: "step_start",
  at: "2026-08-17T10:10:00Z",
  skill: "aidd-dev:02-implement",
} as const;
const TURN_END = { type: "turn_end", at: "2026-08-17T12:00:00Z" } as const;
const EARLIER_TURN_END = { type: "turn_end", at: "2026-08-17T11:00:00Z" } as const;
/** The orchestrating skill saying its own work is over. */
const SDLC_ENDS = {
  type: "step_end",
  at: "2026-08-17T11:00:00Z",
  skill: "aidd-orchestrator:01-sdlc",
} as const;
/** A step *inside* the orchestration saying it is done - which the orchestration is not. */
const PLAN_ENDS = {
  type: "step_end",
  at: "2026-08-17T11:00:00Z",
  skill: "aidd-dev:01-plan",
} as const;
/** Something the journal witnessed after all of the above, so "closed there" and "not closed
 * there" are two different numbers rather than the same one twice. */
const WRITTEN_LATE = {
  type: "file_written",
  at: "2026-08-17T11:30:00Z",
  path: "aidd_docs/tasks/x/spec.md",
} as const;

describe("ORCHESTRATING_SKILLS — declared once, both capture spellings", () => {
  it("names every orchestrator skill, in the argument spelling and the bare directory spelling", () => {
    expect([...ORCHESTRATING_SKILLS].sort()).toEqual(
      [
        "00-async-dev",
        "01-sdlc",
        "02-backlog",
        "aidd-orchestrator:00-async-dev",
        "aidd-orchestrator:01-sdlc",
        "aidd-orchestrator:02-backlog",
      ].sort()
    );
  });

  it("matches no plugin name in passing - nothing here reads a prefix or a substring", () => {
    expect(ORCHESTRATING_SKILLS.has("aidd-orchestrator")).toBe(false);
    expect(ORCHESTRATING_SKILLS.has("aidd-orchestrator:03-does-not-exist")).toBe(false);
  });

  it("hands out the unqualified spellings alone, sorted - the ones a project can collide with", () => {
    expect(bareOrchestratingSkillNames()).toEqual(["00-async-dev", "01-sdlc", "02-backlog"]);
  });

  it("hands out a project's fourth orchestrator too, without anything else being told about it", () => {
    const extended = new Set([...ORCHESTRATING_SKILLS, "acme:03-release", "03-release"]);

    expect(bareOrchestratingSkillNames(extended)).toEqual([
      "00-async-dev",
      "01-sdlc",
      "02-backlog",
      "03-release",
    ]);
  });
});

describe("buildFlowIntervals — pure: journal lines -> bounded flow intervals", () => {
  it("opens a flow at an orchestrating step_start and closes it at the next one", () => {
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS, BACKLOG_OPENS, TURN_END]));

    expect(intervals).toEqual([
      {
        skill: SDLC_OPENS.skill,
        startMs: Date.parse(SDLC_OPENS.at),
        endMs: Date.parse(BACKLOG_OPENS.at),
        closedBy: "boundary",
      },
      {
        skill: BACKLOG_OPENS.skill,
        startMs: Date.parse(BACKLOG_OPENS.at),
        endMs: Date.parse(TURN_END.at),
        // A pause never closes a flow, so this is the cap at the journal's last moment,
        // which the pause happens to be.
        closedBy: "journal-end",
      },
    ]);
  });

  it("closes a flow where its own skill said it was done", () => {
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS, SDLC_ENDS, TURN_END]));

    expect(intervals).toEqual([
      {
        skill: SDLC_OPENS.skill,
        startMs: Date.parse(SDLC_OPENS.at),
        endMs: Date.parse(SDLC_ENDS.at),
        closedBy: "boundary",
      },
    ]);
  });

  it("closes a flow opened by its bare name with the end the orchestrator declares in full", () => {
    // Cursor and Codex write `01-sdlc` into step_start - the plugin never reaches the
    // journal - while the end the skill echoes always carries it. Compared exactly, the
    // declaration those hosts capture closed nothing at all.
    const bareOpener = {
      type: "step_start",
      at: "2026-08-17T10:00:00Z",
      skill: "01-sdlc",
    } as const;
    const intervals = buildFlowIntervals(journalOf([bareOpener, SDLC_ENDS], [], [WRITTEN_LATE]));

    expect(intervals[0]?.endMs).toBe(Date.parse(SDLC_ENDS.at));
  });

  it("still refuses an end whose plugin disagrees with the one that opened the flow", () => {
    const otherPlugin = {
      type: "step_end",
      at: "2026-08-17T11:00:00Z",
      skill: "acme:01-sdlc",
    } as const;
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS, otherPlugin], [], [WRITTEN_LATE]));

    expect(intervals[0]?.endMs).toBe(Date.parse(WRITTEN_LATE.at));
  });

  it("never closes a flow on a step_end naming some other skill", () => {
    // A step run inside the orchestration ends; the orchestration does not. Distinguishing:
    // something is witnessed after that end, so closing there and not closing there are two
    // different numbers.
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS, PLAN_ENDS], [], [WRITTEN_LATE]));

    expect(intervals[0]?.endMs).toBe(Date.parse(WRITTEN_LATE.at));
    expect(intervals[0]?.endMs).not.toBe(Date.parse(PLAN_ENDS.at));
  });

  it("does not close a flow at a turn_end - a pause is not the end of an orchestration", () => {
    // The separating case: with `turn_end` last, the moment it would close at and the
    // journal's own last witnessed moment are the same number, so a fixture ending on the
    // pause proves nothing either way. Something witnessed *after* the pause is what tells
    // the two rules apart — this end is 11:30, and was 11:00 while a `turn_end` closed one.
    const intervals = buildFlowIntervals(
      journalOf([SDLC_OPENS, EARLIER_TURN_END], [], [WRITTEN_LATE])
    );

    expect(intervals[0]?.endMs).toBe(Date.parse(WRITTEN_LATE.at));
    expect(intervals[0]?.endMs).not.toBe(Date.parse(EARLIER_TURN_END.at));
  });

  it("keeps work done after the pause inside the flow that was still running", () => {
    // The consequence a person actually reads: the orchestration measured here paused at
    // 06:02 and worked on for three more hours, and every one of those records used to fall
    // outside its own flow.
    const intervals = buildFlowIntervals(
      journalOf([SDLC_OPENS, EARLIER_TURN_END], [], [WRITTEN_LATE])
    );

    expect(momentFallsWithin(intervals, "2026-08-17T10:30:00Z")).toBe(true);
    expect(momentFallsWithin(intervals, "2026-08-17T11:15:00Z")).toBe(true);
  });

  it("stops at the end its own skill declared, even with work witnessed after it", () => {
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS, SDLC_ENDS], [], [WRITTEN_LATE]));

    expect(momentFallsWithin(intervals, "2026-08-17T10:30:00Z")).toBe(true);
    expect(momentFallsWithin(intervals, "2026-08-17T11:15:00Z")).toBe(false);
  });

  it("never lets a hand-run, non-orchestrating step_start close an open flow", () => {
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS, HAND_RUN_STEP, TURN_END]));

    expect(intervals).toEqual([
      {
        skill: SDLC_OPENS.skill,
        startMs: Date.parse(SDLC_OPENS.at),
        endMs: Date.parse(TURN_END.at),
        closedBy: "journal-end",
      },
    ]);
  });

  it("opens two distinct intervals for the same skill run twice in one session, never merged into one", () => {
    const secondSdlcRun = { ...SDLC_OPENS, at: "2026-08-17T13:00:00Z" };
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS, TURN_END, secondSdlcRun]));

    expect(intervals).toHaveLength(2);
    expect(intervals[0]).not.toBe(intervals[1]);
    expect(intervals.map((interval) => interval.skill)).toEqual([
      SDLC_OPENS.skill,
      SDLC_OPENS.skill,
    ]);
    // The first closes on the second's own start, not on the pause between them.
    expect(intervals[0]?.endMs).toBe(Date.parse(secondSdlcRun.at));
    expect(intervals[1]?.endMs).toBe(Date.parse(secondSdlcRun.at)); // unclosed - capped at its own start
  });

  it("matches the bare directory spelling a Cursor or Codex payload actually writes", () => {
    const bareSpelling = {
      type: "step_start",
      at: "2026-08-17T10:00:00Z",
      skill: "01-sdlc",
    } as const;
    const intervals = buildFlowIntervals(journalOf([bareSpelling, TURN_END]));

    expect(intervals).toEqual([
      {
        skill: "01-sdlc",
        startMs: Date.parse(bareSpelling.at),
        endMs: Date.parse(TURN_END.at),
        closedBy: "journal-end",
      },
    ]);
  });

  it("caps an unclosed flow at its own moment, never at Infinity", () => {
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS]));

    expect(intervals).toEqual([
      {
        skill: SDLC_OPENS.skill,
        startMs: Date.parse(SDLC_OPENS.at),
        endMs: Date.parse(SDLC_OPENS.at),
        closedBy: "journal-end",
      },
    ]);
  });

  it("widens an unclosed flow's end to the journal's own last witnessed moment - a file written after it, no turn_end yet", () => {
    const writtenAfter = {
      type: "file_written",
      at: "2026-08-17T11:30:00Z",
      path: "aidd_docs/tasks/x/spec.md",
    } as const;
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS], [], [writtenAfter]));

    expect(intervals[0]?.endMs).toBe(Date.parse(writtenAfter.at));
  });

  it("clamps an unclosed flow's end to the report's own period end, never past a clock-skewed future moment", () => {
    const farFuture = {
      type: "file_written",
      at: "9999-12-31T00:00:00Z",
      path: "aidd_docs/tasks/x/spec.md",
    } as const;
    const periodEndMs = Date.parse("2026-08-18T00:00:00Z");

    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS], [], [farFuture]), periodEndMs);

    expect(intervals[0]?.endMs).toBe(periodEndMs);
  });

  it("declares no flow interval at all for a session that never ran an orchestrating skill", () => {
    const intervals = buildFlowIntervals(journalOf([HAND_RUN_STEP, TURN_END]));

    expect(intervals).toEqual([]);
  });

  it("touches no filesystem — the module imports none of Node's fs APIs", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../../../src/domain/models/flow-attribution.ts", import.meta.url),
        "utf-8"
      )
    );
    expect(source).not.toMatch(/from ["']node:fs/u);
  });
});

describe("buildFlowIntervals — a journal with no readable moment in it", () => {
  it("builds nothing from a journal with no boundary at all", () => {
    expect(buildFlowIntervals(journalOf([]))).toEqual([]);
  });

  it("builds nothing when every moment it holds is unparseable - never an interval bounded by NaN", () => {
    const unreadable = {
      type: "step_start",
      at: "the seventeenth",
      skill: "aidd-orchestrator:01-sdlc",
    } as const;

    expect(buildFlowIntervals(journalOf([unreadable]))).toEqual([]);
  });

  it("ends a flow nothing ever closed at the journal's own last witnessed moment", () => {
    const wroteLater = {
      type: "file_written",
      at: "2026-08-17T10:45:00Z",
      path: "aidd_docs/tasks/2026_08/2026_08_17_alpha/plan.md",
      source: "stated",
    } as const;

    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS], [], [wroteLater]));

    expect(intervals).toEqual([
      {
        skill: SDLC_OPENS.skill,
        startMs: Date.parse(SDLC_OPENS.at),
        endMs: Date.parse(wroteLater.at),
        closedBy: "journal-end",
      },
    ]);
  });
});

describe("buildFlowIntervals — the limit the flow axis prints beside its figures", () => {
  // Pinned as behaviour, not left to a doc comment: `cost-report-artefact.ts`'s own
  // `flowLimits` tells a reader this happens, and a change here that stopped it happening
  // would leave that sentence describing something the code no longer does.
  it("opens a flow on a bare 01-sdlc, whichever project's own skills/ directory named it", () => {
    const projectsOwnSkill = {
      type: "step_start",
      at: "2026-08-17T10:00:00Z",
      skill: "01-sdlc",
    } as const;

    const intervals = buildFlowIntervals(journalOf([projectsOwnSkill, TURN_END]));

    expect(intervals).toHaveLength(1);
    expect(intervals[0]?.skill).toBe("01-sdlc");
  });
});
