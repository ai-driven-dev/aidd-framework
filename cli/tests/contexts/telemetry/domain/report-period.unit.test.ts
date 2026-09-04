import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPORT_DAYS,
  resolveReportPeriod,
} from "../../../../src/contexts/telemetry/domain/report-period.js";
import { InvalidReportDayError, InvalidReportSpanError } from "../../../../src/kernel/errors.js";

const TODAY = new Date("2026-08-21T09:30:00Z");

describe("resolveReportPeriod", () => {
  it("uses two absolute days as given", () => {
    expect(resolveReportPeriod({ from: "2026-07-01", to: "2026-07-31" }, TODAY)).toEqual({
      fromDay: "2026-07-01",
      toDay: "2026-07-31",
    });
  });

  it("resolves a number of days back into two absolute days, ending today", () => {
    expect(resolveReportPeriod({ days: "3" }, TODAY)).toEqual({
      fromDay: "2026-08-19",
      toDay: "2026-08-21",
    });
  });

  it("counts the span inclusively, so one day is today alone", () => {
    expect(resolveReportPeriod({ days: "1" }, TODAY)).toEqual({
      fromDay: "2026-08-21",
      toDay: "2026-08-21",
    });
  });

  it("uses the documented default when nothing is said", () => {
    expect(resolveReportPeriod({}, TODAY)).toEqual(
      resolveReportPeriod({ days: String(DEFAULT_REPORT_DAYS) }, TODAY)
    );
  });

  it("counts a span back from --to, not from today", () => {
    expect(resolveReportPeriod({ to: "2026-07-31", days: "2" }, TODAY)).toEqual({
      fromDay: "2026-07-30",
      toDay: "2026-07-31",
    });
  });

  it("ends today when only a start is given", () => {
    expect(resolveReportPeriod({ from: "2026-08-01" }, TODAY)).toEqual({
      fromDay: "2026-08-01",
      toDay: "2026-08-21",
    });
  });

  it("reads a period given end-first as the same period", () => {
    expect(resolveReportPeriod({ from: "2026-07-31", to: "2026-07-01" }, TODAY)).toEqual(
      resolveReportPeriod({ from: "2026-07-01", to: "2026-07-31" }, TODAY)
    );
  });

  it("crosses a month boundary by the calendar, not by arithmetic on the day number", () => {
    expect(resolveReportPeriod({ to: "2026-03-02", days: "3" }, TODAY).fromDay).toBe("2026-02-28");
  });

  it("refuses a day that is not one, naming the flag it came from", () => {
    for (const [flag, value] of [
      ["--from", "notaday"],
      ["--from", "2026-8-1"],
      ["--to", "2026-02-31"],
      ["--to", "yesterday"],
      ["--from", ""],
    ] as const) {
      expect(
        () => resolveReportPeriod({ [flag === "--from" ? "from" : "to"]: value }, TODAY),
        `${flag} ${value}`
      ).toThrow(InvalidReportDayError);
    }
  });

  it("names the flag and what it expected, rather than throwing out of a date routine", () => {
    expect(() => resolveReportPeriod({ from: "notaday" }, TODAY)).toThrow(/--from.*YYYY-MM-DD/u);
  });

  it("refuses a span that is not a whole number of days", () => {
    for (const value of ["0", "-1", "1.5", "many", "4000"]) {
      expect(() => resolveReportPeriod({ days: value }, TODAY), value).toThrow(
        InvalidReportSpanError
      );
    }
  });

  it("resolves the same request the same way twice", () => {
    expect(resolveReportPeriod({ days: "7" }, TODAY)).toEqual(
      resolveReportPeriod({ days: "7" }, TODAY)
    );
  });

  it("reads no clock of its own", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../../../src/contexts/telemetry/domain/report-period.ts", import.meta.url)
      ),
      "utf8"
    );

    expect(source).not.toContain("Date.now");
    expect(source).not.toContain("new Date()");
    // A different "today" gives a different answer, which is what makes it the caller's.
    expect(resolveReportPeriod({ days: "1" }, new Date("2026-01-01T00:00:00Z")).toDay).toBe(
      "2026-01-01"
    );
  });
});
