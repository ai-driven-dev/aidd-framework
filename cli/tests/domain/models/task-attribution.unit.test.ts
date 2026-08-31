import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildTaskIntervals,
  momentFallsWithin,
  taskUnattributedReason,
} from "../../../src/domain/models/task-attribution.js";
import type { RunJournal } from "../../../src/domain/ports/run-journal-reader.js";

function journalOf(
  taskDeclarations: RunJournal["taskDeclarations"],
  boundaries: RunJournal["boundaries"] = [],
  filesWritten: RunJournal["filesWritten"] = []
): RunJournal {
  return { boundaries, filesWritten, taskDeclarations };
}

const WANTED = {
  type: "task_declared",
  at: "2026-08-17T10:00:00Z",
  path: "aidd_docs/tasks/2026_08/wanted/spec.md",
} as const;
const OTHER = {
  type: "task_declared",
  at: "2026-08-17T10:10:00Z",
  path: "aidd_docs/tasks/2026_08/other/spec.md",
} as const;
const TURN_END = { type: "turn_end", at: "2026-08-17T10:15:00Z" } as const;

describe("task-attribution — pure: journal lines -> bounded intervals", () => {
  it("closes a declared interval at the turn_end that follows it", () => {
    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END]));

    expect(intervals).toEqual([
      { path: WANTED.path, startMs: Date.parse(WANTED.at), endMs: Date.parse(TURN_END.at) },
    ]);
  });

  it("closes a declaration at a later declaration, never at the turn's own end past it", () => {
    const intervals = buildTaskIntervals(journalOf([WANTED, OTHER], [TURN_END]));

    expect(intervals).toEqual([
      { path: WANTED.path, startMs: Date.parse(WANTED.at), endMs: Date.parse(OTHER.at) },
      { path: OTHER.path, startMs: Date.parse(OTHER.at), endMs: Date.parse(TURN_END.at) },
    ]);
  });

  it("caps an unclosed declaration at its own moment, never at Infinity", () => {
    // No turn_end at all - the session crashed right after declaring.
    const intervals = buildTaskIntervals(journalOf([WANTED]));

    expect(intervals).toEqual([
      { path: WANTED.path, startMs: Date.parse(WANTED.at), endMs: Date.parse(WANTED.at) },
    ]);
    expect(momentFallsWithin(intervals, "2026-08-17T10:30:00Z")).toBe(false);
  });

  it("caps an unclosed declaration at the last boundary the journal actually recorded", () => {
    const laterStep = {
      type: "step_start",
      at: "2026-08-17T10:20:00Z",
      skill: "aidd-dev:02-implement",
    } as const;
    const intervals = buildTaskIntervals(journalOf([WANTED], [laterStep]));

    // step_start is not one of the two kinds an interval closes on, but it is still the
    // journal's own last recorded moment - the honest bound for a crash right after it.
    expect(intervals[0].endMs).toBe(Date.parse(laterStep.at));
  });

  it("never lets a step_start close a declared interval early - only task_declared and turn_end do", () => {
    const stepBetween = {
      type: "step_start",
      at: "2026-08-17T10:05:00Z",
      skill: "aidd-dev:02-implement",
    } as const;
    const intervals = buildTaskIntervals(journalOf([WANTED], [stepBetween, TURN_END]));

    expect(intervals).toEqual([
      { path: WANTED.path, startMs: Date.parse(WANTED.at), endMs: Date.parse(TURN_END.at) },
    ]);
  });

  it("declares no interval at all for a journal that never named a task", () => {
    expect(buildTaskIntervals(journalOf([], [TURN_END]))).toEqual([]);
  });

  it("reads a moment inside the interval as covered, and one outside as not", () => {
    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END]));

    expect(momentFallsWithin(intervals, "2026-08-17T10:05:00Z")).toBe(true);
    expect(momentFallsWithin(intervals, "2026-08-17T09:59:59Z")).toBe(false);
    expect(momentFallsWithin(intervals, "2026-08-17T10:15:00Z")).toBe(false);
  });

  it("reads a record with no moment, or an unparseable one, as not covered", () => {
    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END]));

    expect(momentFallsWithin(intervals, undefined)).toBe(false);
    expect(momentFallsWithin(intervals, "not-a-date")).toBe(false);
  });

  it("touches no filesystem — the module imports none of Node's fs APIs", () => {
    const url = new URL("../../../src/domain/models/task-attribution.ts", import.meta.url);
    const source = readFileSync(fileURLToPath(url), "utf8");

    expect(source).not.toMatch(/from ["']node:fs/);
    expect(source).not.toMatch(/require\(["']node:fs/);
  });

  // The bug this deliverable exists to fix: a session still running when a report is asked
  // for has declared a task, written a file after it, and produced no turn_end yet.
  // `lastMs` used to come only from step starts, turn ends and declarations - none of which
  // exist here - so the interval collapsed to `[t, t)` and lost every record after it.
  it("widens an unclosed declaration's end to a written file the journal witnessed after it", () => {
    const writtenAfter = {
      type: "file_written",
      at: "2026-08-17T10:40:00Z",
      path: "x.md",
    } as const;
    const intervals = buildTaskIntervals(journalOf([WANTED], [], [writtenAfter]));

    expect(intervals).toEqual([
      { path: WANTED.path, startMs: Date.parse(WANTED.at), endMs: Date.parse(writtenAfter.at) },
    ]);
    // The record this bug used to lose: after the declaration, before the write, no
    // turn_end anywhere in sight - the ordinary state of a session still running.
    expect(momentFallsWithin(intervals, "2026-08-17T10:20:00Z")).toBe(true);
  });

  it("never lets a written file reach further back than the interval's own last closer", () => {
    const writtenBefore = {
      type: "file_written",
      at: "2026-08-17T09:00:00Z",
      path: "x.md",
    } as const;
    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END], [writtenBefore]));

    expect(intervals).toEqual([
      { path: WANTED.path, startMs: Date.parse(WANTED.at), endMs: Date.parse(TURN_END.at) },
    ]);
  });

  it("still never runs away: a written file does not turn the interval open-ended", () => {
    const writtenAfter = {
      type: "file_written",
      at: "2026-08-17T10:40:00Z",
      path: "x.md",
    } as const;
    const intervals = buildTaskIntervals(journalOf([WANTED], [], [writtenAfter]));

    // Long after the last thing the journal witnessed - never attributed, whatever silence
    // followed the write.
    expect(momentFallsWithin(intervals, "2026-08-20T00:00:00Z")).toBe(false);
  });
});

describe("taskUnattributedReason — which of three distinct facts applies", () => {
  it("names no-declaration for a session whose journal never declared a task", () => {
    expect(taskUnattributedReason([], "2026-08-17T10:00:00Z")).toBe("no-declaration");
  });

  it("names precedes-declaration for a record before the session's only declaration", () => {
    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END]));

    expect(taskUnattributedReason(intervals, "2026-08-17T09:00:00Z")).toBe("precedes-declaration");
  });

  it("names precedes-declaration for a record in the gap a turn_end leaves before the next declaration - never journal-silent, since the journal keeps going right through it", () => {
    // WANTED closes at TURN_END (10:15); a further declaration follows once the journal is
    // alive again, at 11:00, leaving a real gap in between that no interval covers.
    const laterDeclaration = {
      type: "task_declared",
      at: "2026-08-17T11:00:00Z",
      path: "aidd_docs/tasks/2026_08/later/spec.md",
    } as const;
    const intervals = buildTaskIntervals(journalOf([WANTED, laterDeclaration], [TURN_END]));

    // 10:30 falls after WANTED's own interval closed at TURN_END (10:15) and before
    // laterDeclaration opens at 11:00 - a real gap the journal is not silent through.
    expect(taskUnattributedReason(intervals, "2026-08-17T10:30:00Z")).toBe("precedes-declaration");
  });

  it("names journal-silent for a record after the last declared interval's own end", () => {
    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END]));

    expect(taskUnattributedReason(intervals, "2026-08-17T11:00:00Z")).toBe("journal-silent");
  });

  it("names journal-silent for a record with no moment, once a task was declared", () => {
    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END]));

    expect(taskUnattributedReason(intervals, undefined)).toBe("journal-silent");
    expect(taskUnattributedReason(intervals, "not-a-date")).toBe("journal-silent");
  });
});
