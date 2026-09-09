import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { momentFallsWithin } from "../../../../src/contexts/telemetry/domain/journal-intervals.js";
import type { RunJournal } from "../../../../src/contexts/telemetry/domain/ports/run-journal-reader.js";
import {
  buildTaskIntervals,
  taskUnattributedReason,
} from "../../../../src/contexts/telemetry/domain/task-attribution.js";

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

  // A `turn_end` is a pause, not a change of subject. It stays a *witness*, so an interval
  // with nothing after it still ends there; what changes is one with work after it.
  it("keeps a declaration open across a turn_end, ending at the work that followed", () => {
    const wrote = {
      type: "file_written",
      at: "2026-08-17T10:20:00Z",
      path: "aidd_docs/tasks/2026_08/wanted/phase-1.md",
    } as const;
    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END], [wrote]));

    expect(intervals).toEqual([
      { path: WANTED.path, startMs: Date.parse(WANTED.at), endMs: Date.parse(wrote.at) },
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

  it("drops a task_declared line whose own `at` this reader cannot parse, the same as one that was never written", () => {
    // `taskUnattributedReason` folds this into "no-declaration" beside a session that truly
    // never declared, which is why that label reads "no *usable* declaration".
    const unparseable = {
      type: "task_declared",
      at: "not-a-real-timestamp",
      path: WANTED.path,
    } as const;

    expect(buildTaskIntervals(journalOf([unparseable], [TURN_END]))).toEqual([]);
  });

  it("emits no interval for a declared path this reader cannot turn into an identity, but still lets it close the interval before it", () => {
    // A `..` segment passes `task-declared.cjs`'s looser gate and names no task; dropped from
    // `closers` too, it would silently widen WANTED's interval past its own declaration.
    const climbing = {
      type: "task_declared",
      at: "2026-08-17T10:10:00Z",
      path: "aidd_docs/tasks/2026_08/../../etc/passwd",
    } as const;

    const intervals = buildTaskIntervals(journalOf([WANTED, climbing], [TURN_END]));

    expect(intervals).toEqual([
      { path: WANTED.path, startMs: Date.parse(WANTED.at), endMs: Date.parse(climbing.at) },
    ]);
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
    const url = new URL(
      "../../../../src/contexts/telemetry/domain/task-attribution.ts",
      import.meta.url
    );
    const source = readFileSync(fileURLToPath(url), "utf8");

    expect(source).not.toMatch(/from ["']node:fs/);
    expect(source).not.toMatch(/require\(["']node:fs/);
  });

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
    // After the declaration, before the write, no turn_end anywhere in sight - the
    // ordinary state of a session still running.
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

    // Long after the last thing the journal witnessed.
    expect(momentFallsWithin(intervals, "2026-08-20T00:00:00Z")).toBe(false);
  });

  it("clamps an unclosed interval's end to the report's own period end, never past it", () => {
    // A clock-skewed `file_written` far in the future still parses, and no record this reader
    // places can fall past the period's own end, so capping there costs nothing real.
    const farFuture = {
      type: "file_written",
      at: "9999-12-31T00:00:00Z",
      path: "x.md",
    } as const;
    const periodEndMs = Date.parse("2026-08-18T00:00:00Z");

    const intervals = buildTaskIntervals(journalOf([WANTED], [], [farFuture]), periodEndMs);

    expect(intervals).toEqual([
      { path: WANTED.path, startMs: Date.parse(WANTED.at), endMs: periodEndMs },
    ]);
    expect(momentFallsWithin(intervals, "2040-01-01T00:00:00Z")).toBe(false);
  });

  it("leaves an unclosed interval's end exactly where a real closer put it, when that is well inside the period", () => {
    // The clamp must never pull a legitimate end earlier - only a witnessed moment beyond
    // the period end is capped.
    const periodEndMs = Date.parse("2026-08-20T00:00:00Z");

    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END]), periodEndMs);

    expect(intervals).toEqual([
      { path: WANTED.path, startMs: Date.parse(WANTED.at), endMs: Date.parse(TURN_END.at) },
    ]);
  });
});

describe("taskUnattributedReason — which of four distinct facts applies", () => {
  it("names no-declaration for a session whose journal never declared a task", () => {
    expect(taskUnattributedReason([], "2026-08-17T10:00:00Z")).toBe("no-declaration");
  });

  it("names precedes-declaration for a record before the session's only declaration", () => {
    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END]));

    expect(taskUnattributedReason(intervals, "2026-08-17T09:00:00Z")).toBe("precedes-declaration");
  });

  // A resumed transcript carries turns billed days before the session that read them ever
  // started, so the sink dates them before its journal witnessed anything.
  it("names precedes-journal for a record older than everything its journal witnessed", () => {
    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END]));
    const journalFromMs = Date.parse("2026-08-17T09:30:00Z");

    expect(taskUnattributedReason(intervals, "2026-08-10T12:00:00Z", journalFromMs)).toBe(
      "precedes-journal"
    );
  });

  it("still names precedes-declaration inside the span, before the first declaration", () => {
    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END]));
    const journalFromMs = Date.parse("2026-08-17T09:30:00Z");

    expect(taskUnattributedReason(intervals, "2026-08-17T09:45:00Z", journalFromMs)).toBe(
      "precedes-declaration"
    );
  });

  // The coverage check runs first: it is the fact that explains why no declaration could
  // have covered this record at all.
  it("names precedes-journal, not no-declaration, when the journal declared nothing either", () => {
    const journalFromMs = Date.parse("2026-08-17T09:30:00Z");

    expect(taskUnattributedReason([], "2026-08-10T12:00:00Z", journalFromMs)).toBe(
      "precedes-journal"
    );
  });

  it("never claims coverage for a journal that carries no readable moment", () => {
    const intervals = buildTaskIntervals(journalOf([WANTED], [TURN_END]));

    expect(taskUnattributedReason(intervals, "2026-08-10T12:00:00Z", undefined)).toBe(
      "precedes-declaration"
    );
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
