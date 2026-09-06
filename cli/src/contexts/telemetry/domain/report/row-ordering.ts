/** How a breakdown orders its rows: largest amount first, tokens as the fallback weight
 * when a row is costless, and a moment rendered to second precision. */

import type { CostTotals } from "../cost-report.js";

/** Every token a row counted, across all four disjoint counters. The weight `bySize` falls
 * back to for a costless row - never `inputTokens + outputTokens` alone: every tool this
 * report has ever seen runs at 90%-plus cache, so a weight blind to the two cache counters
 * would order a costless breakdown by the sliver of its volume nobody reads it for, and
 * invert the order a reader actually wants. It is also the same sum the report already
 * prints beside a costless row - weighing by anything else would sort a row by a number the
 * report never shows. */
function tokensOf(totals: CostTotals): number {
  return (
    (totals.inputTokens ?? 0) +
    (totals.outputTokens ?? 0) +
    (totals.cacheReadTokens ?? 0) +
    (totals.cacheCreationTokens ?? 0)
  );
}

/** Largest first, so the biggest thing is the first thing read. Weighted by amount where
 * one exists and by tokens where none does, since a tool with no amount would otherwise
 * sort as if it had cost nothing. Ties fall back to the row's own key, so the same records
 * always produce the same report. */
export function bySize<T>(
  rows: readonly T[],
  totalsOf: (row: T) => CostTotals,
  keyOf: (row: T) => string
): T[] {
  const weight = (row: T): number => {
    const totals = totalsOf(row);
    return totals.costMicroUsd ?? tokensOf(totals);
  };
  return [...rows].sort(
    (left, right) => weight(right) - weight(left) || keyOf(left).localeCompare(keyOf(right))
  );
}

// Second precision, no milliseconds - the same spelling `record.cjs`'s own `nowIso` writes
// to the journal's `at` field. `startMs` here always comes from `Date.parse`-ing one such
// value, so its own milliseconds are already zero; this only strips the ".000" `toISOString`
// would otherwise append, so a row's `startedAt` string-matches the journal line it opened
// on rather than looking like a different moment.
export function isoSecondsFromMs(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/u, "Z");
}
