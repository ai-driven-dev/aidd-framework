import type { TelemetrySinkRecord } from "../models/telemetry-sink-record.js";

/** What a per-tool local reader returns: every field of the stored shape except the two
 * the caller stamps uniformly across every tool — `sink_schema_version` and `provenance`.
 * A reader that could set `provenance` itself could also claim to be an export it is not. */
export type LocalCostCandidateRecord = Omit<
  TelemetrySinkRecord,
  "sink_schema_version" | "provenance"
>;

/**
 * What a per-tool local reader promises: given the session identity a run-journal entry
 * already carries, return the records that tool's own file holds for it — nothing more,
 * nothing else joined in. `read` resolves to an empty array, never throws, when the tool
 * wrote no file for that session; that is a tool which ran and consumed nothing, not an
 * error.
 *
 * Every returned record's `vendor_id` equals the `sessionId` passed in, so a caller never
 * resolves identity twice. `turn_id`, when the tool's file carries a stable per-record
 * identifier, is how a re-read is matched against what is already stored — a reader whose
 * tool has none leaves `turn_id` unset rather than inventing one; a synthesised key that is
 * not stable across reads is worse than an absent one, and records left unmatched by one
 * are simply appended again rather than deduplicated.
 */
export interface SessionCostReader {
  read(sessionId: string): Promise<readonly LocalCostCandidateRecord[]>;
}

/**
 * What a per-line transcript format hands the streaming adapter: `push` for every line in
 * file order, `build` once the file is exhausted. Stateful because not every tool's format
 * maps one line to one record — Codex's spans a `turn_context` line and the `token_count`
 * lines that follow it — while a format with no such pairing simply ignores everything but
 * the current line. Declared here, in the port, so a domain format module can implement it
 * without importing the infrastructure adapter that drives it.
 */
export interface TranscriptLineAccumulator {
  push(line: string): void;
  build(): readonly LocalCostCandidateRecord[];
}
