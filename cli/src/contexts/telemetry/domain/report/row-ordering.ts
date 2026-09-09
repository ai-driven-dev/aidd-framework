/** How a breakdown orders its rows: largest amount first, tokens as the fallback weight
 * when a row is costless, and a moment rendered to second precision. */

import type { CostTotals } from "../cost-report.js";

/** Every token a row counted, across all four disjoint counters - the weight `bySize` falls
 * back to for a costless row. Never `inputTokens + outputTokens` alone: tools run mostly on
 * cache, so a weight blind to the cache counters would invert the order, and this is also the
 * same sum the report prints beside a costless row. */
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

// Second precision, no milliseconds - the same spelling the journal hook writes to a line's
// `at` field, so a row's `startedAt` string-matches the line it opened on. `startMs` is parsed
// from one such value, so this only strips the ".000" `toISOString` would append.
export function isoSecondsFromMs(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/u, "Z");
}
