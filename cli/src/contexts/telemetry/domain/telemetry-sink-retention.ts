/** Measured: a mapped `request` line is 576 bytes, so ~281 KB on a 500-request day and
 * ~25 MB over the window. */
export const DEFAULT_TELEMETRY_SINK_RETENTION_DAYS = 90;

export interface TelemetrySinkRetentionDecision {
  readonly keep: readonly string[];
  readonly prune: readonly string[];
}

/** `windowDays` is clamped to at least 1, so the newest day file is never a prune
 * candidate whatever value is passed. */
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
