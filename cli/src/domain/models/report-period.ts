import { InvalidReportDayError, InvalidReportSpanError } from "../errors.js";

/** The two UTC days a report covers, inclusive, as they resolved.
 *
 * A consumer stores this beside a figure. Reporting the period as it was *asked for* — "the
 * last seven days" — would give two callers on two days the same words for two different
 * measurements, and a figure nobody can reproduce is a figure nobody can cite. */
export interface ResolvedReportPeriod {
  readonly fromDay: string;
  readonly toDay: string;
}

/** What a caller asked for, in any of the three ways it can be said. */
export interface ReportPeriodRequest {
  readonly from?: string;
  readonly to?: string;
  readonly days?: string;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const DAY_KEY_LENGTH = "YYYY-MM-DD".length;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** A week: the span someone asks about after finishing a piece of work, and short enough
 * that a first run answers instead of scanning a year of day files. */
export const DEFAULT_REPORT_DAYS = 7;
const MAX_REPORT_DAYS = 3650;

function parseDay(flag: string, value: string): string {
  // The shape first, then the calendar: `2026-02-31` matches the pattern and is not a day,
  // and `Date.parse` alone would accept a great deal that is not a day at all.
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

/**
 * What was asked for, plus today, resolved once into two absolute days.
 *
 * Pure, and it never reads a clock: `today` is the caller's, so the same request resolves
 * the same way twice — which is the whole point of the type. The two days come back in
 * order however they were given, since a period asked for end-first is the same period.
 */
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
