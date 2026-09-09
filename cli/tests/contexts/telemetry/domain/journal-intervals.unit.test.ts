import { describe, expect, it } from "vitest";
import {
  buildClosedIntervals,
  type IntervalClosure,
  timed,
} from "../../../../src/contexts/telemetry/domain/journal-intervals.js";

interface Boundary {
  readonly at: string;
  readonly kind: "open" | "close" | "other";
}

interface Interval {
  readonly startMs: number;
  readonly endMs: number;
  readonly closedBy: IntervalClosure;
}

const isOpener = (boundary: Boundary): boundary is Boundary => boundary.kind === "open";
const isCloser = (boundary: Boundary): boolean => boundary.kind === "close";
const toInterval = (
  _opener: Boundary,
  startMs: number,
  endMs: number,
  closedBy: IntervalClosure
): Interval => ({ startMs, endMs, closedBy });

describe("timed()", () => {
  it("drops a boundary whose own at cannot be parsed, instead of leaving a mid-list gap", () => {
    const result = timed([
      { at: "2026-01-01T00:00:00.000Z" },
      { at: "not-a-date" },
      { at: "2026-01-02T00:00:00.000Z" },
    ]);

    expect(result.map((entry) => entry.boundary.at)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
    ]);
  });

  it("sorts by the parsed moment, whatever order the input carried", () => {
    const result = timed([{ at: "2026-01-02T00:00:00.000Z" }, { at: "2026-01-01T00:00:00.000Z" }]);

    expect(result.map((entry) => entry.atMs)).toEqual([
      Date.parse("2026-01-01T00:00:00.000Z"),
      Date.parse("2026-01-02T00:00:00.000Z"),
    ]);
  });
});

describe("buildClosedIntervals — the periodEndMs cap", () => {
  it("caps an unclosed interval's end at periodEndMs, never at a later moment the journal witnessed", () => {
    const opensAt = Date.parse("2026-01-01T00:00:00.000Z");
    const periodEndMs = Date.parse("2026-01-02T00:00:00.000Z");
    const boundaries: readonly Boundary[] = [
      { at: "2026-01-01T00:00:00.000Z", kind: "open" },
      { at: "2026-01-05T00:00:00.000Z", kind: "other" },
    ];

    const intervals = buildClosedIntervals(boundaries, periodEndMs, isOpener, isCloser, toInterval);

    expect(intervals).toEqual([{ startMs: opensAt, endMs: periodEndMs, closedBy: "journal-end" }]);
  });
});

describe("IntervalClosure — the three ways an interval's end is reached", () => {
  it("closes on an explicit closer boundary", () => {
    const boundaries: readonly Boundary[] = [
      { at: "2026-01-01T00:00:00.000Z", kind: "open" },
      { at: "2026-01-02T00:00:00.000Z", kind: "close" },
    ];

    const intervals = buildClosedIntervals(boundaries, undefined, isOpener, isCloser, toInterval);

    expect(intervals).toEqual([
      {
        startMs: Date.parse("2026-01-01T00:00:00.000Z"),
        endMs: Date.parse("2026-01-02T00:00:00.000Z"),
        closedBy: "boundary",
      },
    ]);
  });

  it("closes on the next opener, even with no explicit closer in between", () => {
    const boundaries: readonly Boundary[] = [
      { at: "2026-01-01T00:00:00.000Z", kind: "open" },
      { at: "2026-01-02T00:00:00.000Z", kind: "open" },
    ];

    const intervals = buildClosedIntervals(boundaries, undefined, isOpener, isCloser, toInterval);

    expect(intervals[0]).toEqual({
      startMs: Date.parse("2026-01-01T00:00:00.000Z"),
      endMs: Date.parse("2026-01-02T00:00:00.000Z"),
      closedBy: "boundary",
    });
  });

  it("stays open to the journal's own last witnessed moment when nothing closes it", () => {
    const boundaries: readonly Boundary[] = [
      { at: "2026-01-01T00:00:00.000Z", kind: "open" },
      { at: "2026-01-03T00:00:00.000Z", kind: "other" },
    ];

    const intervals = buildClosedIntervals(boundaries, undefined, isOpener, isCloser, toInterval);

    expect(intervals).toEqual([
      {
        startMs: Date.parse("2026-01-01T00:00:00.000Z"),
        endMs: Date.parse("2026-01-03T00:00:00.000Z"),
        closedBy: "journal-end",
      },
    ]);
  });
});
