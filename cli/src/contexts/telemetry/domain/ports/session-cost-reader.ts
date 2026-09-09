import type { TelemetrySinkRecord } from "../telemetry-sink-record.js";

/** What a per-tool local reader returns: the stored shape minus the four fields the caller
 * stamps uniformly. A reader able to set `provenance`, `tool` or `step_attribution` could
 * claim to be an export it is not, name another tool, or state a derivation only the caller
 * — which alone reads the run journal — can perform. A reader may still set `step` and
 * `step_plugin`: that presence *is* the tool-stated fact the caller resolves
 * `step_attribution: "tool-stated"` from. */
export type LocalCostCandidateRecord = Omit<
  TelemetrySinkRecord,
  "sink_schema_version" | "provenance" | "tool" | "step_attribution"
>;

/** What a reader answers with. `sessionFound` separates the two silences a bare empty list
 * conflates: a tool that held this session and recorded nothing billable, and one that held
 * no trace of it at all. Printed as one zero, a session never found reads as free. */
export interface LocalCostReadResult {
  readonly records: readonly LocalCostCandidateRecord[];
  readonly sessionFound: boolean;
}

/**
 * Given the session identity a run-journal entry already carries, the records that tool's own
 * file holds for it — nothing joined in. A tool that wrote no file answers `sessionFound:
 * false` with no records rather than throwing. Every returned record's `vendor_id` equals the
 * `sessionId` passed in, so a caller never resolves identity twice. `turn_id` is how a re-read
 * is matched against what is already stored, and a reader whose tool carries no stable
 * per-record identifier leaves it unset: an unstable synthesised key is worse than an absent
 * one, since records unmatched by one are appended again rather than deduplicated.
 */
export interface SessionCostReader {
  read(sessionId: string): Promise<LocalCostReadResult>;
}

/**
 * What a per-line transcript format hands the streaming adapter: `push` for every line in file
 * order, `build` once the file is exhausted. Stateful because not every tool's format maps one
 * line to one record — Codex's spans a `turn_context` line and the `token_count` lines that
 * follow it. Declared in the port so a domain format module can implement it without importing
 * the infrastructure adapter that drives it.
 */
export interface TranscriptLineAccumulator {
  push(line: string): void;
  build(): readonly LocalCostCandidateRecord[];
}
