/**
 * Measured: one mapped `request` line from a real captured payload
 * (`tests/fixtures/telemetry-sink/otlp-logs-claude-code.json`) serializes to 576 bytes.
 * At 500 billed requests — a genuinely heavy working day — that's ~281 KB/day; 90 days of
 * that is ~25 MB. Bounding growth over months is the goal, not saving space today, so the
 * default favors a long window over a tight one.
 */
export const DEFAULT_TELEMETRY_SINK_RETENTION_DAYS = 90;

export interface TelemetrySinkRetentionDecision {
  readonly keep: readonly string[];
  readonly prune: readonly string[];
}

/**
 * Pure: given the day files present (`YYYY-MM-DD.jsonl`, whatever order) and a window in
 * days, says which survive and which are pruned — oldest first, whole days only. Never
 * touches disk; the caller does the deleting. `windowDays` is clamped to at least 1 so the
 * newest file is never a prune candidate, whatever value is passed.
 */
export function decideTelemetrySinkRetention(
  dayFileNames: readonly string[],
  windowDays: number
): TelemetrySinkRetentionDecision {
  const window = Math.max(1, Math.floor(windowDays));
  const sorted = [...dayFileNames].sort();
  if (sorted.length <= window) return { keep: sorted, prune: [] };
  return {
    keep: sorted.slice(sorted.length - window),
    prune: sorted.slice(0, sorted.length - window),
  };
}
