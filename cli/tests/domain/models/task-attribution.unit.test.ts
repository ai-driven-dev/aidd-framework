import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildTaskIntervals,
  momentFallsWithin,
} from "../../../src/domain/models/task-attribution.js";
import type { RunJournal } from "../../../src/domain/ports/run-journal-reader.js";

function journalOf(
  taskDeclarations: RunJournal["taskDeclarations"],
  boundaries: RunJournal["boundaries"] = []
): RunJournal {
  return { boundaries, filesWritten: [], taskDeclarations };
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
});
