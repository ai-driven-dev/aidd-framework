/** At ~576 bytes per mapped `request` line, about 25 MB over the window on a busy machine. */
export const DEFAULT_TELEMETRY_SINK_RETENTION_DAYS = 90;

export interface TelemetrySinkRetentionDecision {
  readonly keep: readonly string[];
  readonly prune: readonly string[];
}

/** `windowDays` is clamped to at least 1: the newest day file is never a prune candidate. */
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
