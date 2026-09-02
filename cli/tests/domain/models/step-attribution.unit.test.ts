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

  it("closes the last step at its own turn_end, leaving nothing beyond it covered", () => {
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

  it("touches no filesystem — the module imports none of Node's fs APIs", () => {
    const url = new URL("../../../src/domain/models/step-attribution.ts", import.meta.url);
    const source = readFileSync(fileURLToPath(url), "utf8");

    expect(source).not.toMatch(/from ["']node:fs/);
    expect(source).not.toMatch(/require\(["']node:fs/);
  });
});

describe("buildStepIntervals — a step the session never closed", () => {
  // Pinned because it is a choice, not an accident, and one that differs from how
  // `journal-intervals.ts` treats an unclosed task or flow. See `StepInterval`'s own doc
  // comment for why the cap those two apply cannot be applied here — and note that
  // `aidd telemetry check`'s `records-join` claim depends on this reading, so changing it
  // is a behaviour change, not a tidy-up.
  it("leaves the last step open when no turn_end ever closed it", () => {
    const intervals = buildStepIntervals({
      boundaries: [{ type: "step_start", at: "2026-08-17T10:00:00Z", skill: "aidd-dev:01-plan" }],
      filesWritten: [],
      taskDeclarations: [],
    });

    expect(intervals).toEqual([
      {
        skill: "aidd-dev:01-plan",
        startMs: Date.parse("2026-08-17T10:00:00Z"),
        endMs: Number.POSITIVE_INFINITY,
      },
    ]);
  });

  it("attributes a much later moment to it, which is what leaving it open means", () => {
    const intervals = buildStepIntervals({
      boundaries: [{ type: "step_start", at: "2026-08-17T10:00:00Z", skill: "aidd-dev:01-plan" }],
      filesWritten: [],
      taskDeclarations: [],
    });

    expect(attributeMoment(intervals, "2026-09-30T23:59:00Z")).toEqual({
      source: "journal-interval",
      step: "aidd-dev:01-plan",
    });
  });
});
