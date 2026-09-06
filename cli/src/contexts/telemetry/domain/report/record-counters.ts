/** The four token counters a record can carry, and the record field each one is read from. */

import type { TelemetrySinkRecord } from "../telemetry-sink-record.js";

// Declared as the list first and the type derived from it, rather than the other way
// round: reading the keys back off the table would have to assert their type, and an
// assertion is exactly what stops holding the day the table and the type disagree.
export const COUNTER_FIELDS = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheCreationTokens",
] as const;

export type CounterField = (typeof COUNTER_FIELDS)[number];

export const COUNTER_SOURCE: Readonly<Record<CounterField, keyof TelemetrySinkRecord>> = {
  inputTokens: "input_tokens",
  outputTokens: "output_tokens",
  cacheReadTokens: "cache_read_tokens",
  cacheCreationTokens: "cache_creation_tokens",
};
