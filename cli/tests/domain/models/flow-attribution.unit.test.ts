import { describe, expect, it } from "vitest";
import {
  buildFlowIntervals,
  ORCHESTRATING_SKILLS,
} from "../../../src/domain/models/flow-attribution.js";
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
});

describe("buildFlowIntervals — pure: journal lines -> bounded flow intervals", () => {
  it("opens a flow at an orchestrating step_start and closes it at the next one", () => {
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS, BACKLOG_OPENS, TURN_END]));

    expect(intervals).toEqual([
      {
        skill: SDLC_OPENS.skill,
        startMs: Date.parse(SDLC_OPENS.at),
        endMs: Date.parse(BACKLOG_OPENS.at),
      },
      {
        skill: BACKLOG_OPENS.skill,
        startMs: Date.parse(BACKLOG_OPENS.at),
        endMs: Date.parse(TURN_END.at),
      },
    ]);
  });

  it("closes a flow at turn_end when nothing else orchestrates first", () => {
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS, TURN_END]));

    expect(intervals).toEqual([
      {
        skill: SDLC_OPENS.skill,
        startMs: Date.parse(SDLC_OPENS.at),
        endMs: Date.parse(TURN_END.at),
      },
    ]);
  });

  it("never lets a hand-run, non-orchestrating step_start close an open flow", () => {
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS, HAND_RUN_STEP, TURN_END]));

    expect(intervals).toEqual([
      {
        skill: SDLC_OPENS.skill,
        startMs: Date.parse(SDLC_OPENS.at),
        endMs: Date.parse(TURN_END.at),
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
      { skill: "01-sdlc", startMs: Date.parse(bareSpelling.at), endMs: Date.parse(TURN_END.at) },
    ]);
  });

  it("caps an unclosed flow at its own moment, never at Infinity", () => {
    const intervals = buildFlowIntervals(journalOf([SDLC_OPENS]));

    expect(intervals).toEqual([
      {
        skill: SDLC_OPENS.skill,
        startMs: Date.parse(SDLC_OPENS.at),
        endMs: Date.parse(SDLC_OPENS.at),
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
