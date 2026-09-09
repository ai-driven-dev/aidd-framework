import { InvalidReportDayError, InvalidReportSpanError } from "../../../kernel/errors.js";

/** The two UTC days a report covers, inclusive, as they resolved. Stored beside a figure:
 * "the last seven days" names two different measurements on two different days. */
export interface ResolvedReportPeriod {
  readonly fromDay: string;
  readonly toDay: string;
}

export interface ReportPeriodRequest {
  readonly from?: string;
  readonly to?: string;
  readonly days?: string;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const DAY_KEY_LENGTH = "YYYY-MM-DD".length;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** A week: short enough that a first run answers instead of scanning a year of day files. */
export const DEFAULT_REPORT_DAYS = 7;
const MAX_REPORT_DAYS = 3650;

function parseDay(flag: string, value: string): string {
  // Shape first, then the calendar: a well-shaped string can still name a day no month has,
  // and `Date.parse` alone accepts a great deal that is not a day at all.
  if (!DAY_PATTERN.test(value)) throw new InvalidReportDayError(flag, value);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new InvalidReportDayError(flag, value);
  if (dayKey(parsed) !== value) throw new InvalidReportDayError(flag, value);
  return value;
}

function parseSpan(value: string): number {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_REPORT_DAYS) {
    throw new InvalidReportSpanError(value, MAX_REPORT_DAYS);
  }
  return days;
}

function dayKey(at: Date): string {
  return at.toISOString().slice(0, DAY_KEY_LENGTH);
}

function daysBefore(day: string, count: number): string {
  return dayKey(new Date(Date.parse(`${day}T00:00:00Z`) - count * MILLISECONDS_PER_DAY));
}

/** Never reads a clock: `today` is the caller's, so one request resolves the same way twice.
 * The two days come back in order however they were given. */
export function resolveReportPeriod(
  request: ReportPeriodRequest,
  today: Date
): ResolvedReportPeriod {
  const span = request.days === undefined ? DEFAULT_REPORT_DAYS : parseSpan(request.days);
  const toDay = request.to === undefined ? dayKey(today) : parseDay("--to", request.to);
  const fromDay =
    request.from === undefined ? daysBefore(toDay, span - 1) : parseDay("--from", request.from);
  return fromDay <= toDay ? { fromDay, toDay } : { fromDay: toDay, toDay: fromDay };
}
