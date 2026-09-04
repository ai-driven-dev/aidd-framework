import type { TelemetrySinkRecord } from "../telemetry-sink-record.js";

/** What a per-tool local reader returns: every field of the stored shape except the four
 * the caller stamps uniformly across every tool — `sink_schema_version`, `provenance`,
 * `tool`, and `step_attribution`. A reader that could set `provenance` itself could also
 * claim to be an export it is not; `tool` joins the same omission list for the same reason
 * — a reader that could name itself could name another. `step_attribution` joins it too: a
 * reader that could stamp `"journal-interval"` could claim a derivation it never performed,
 * and only the caller, which alone reads the run journal, may say that source was used. A
 * reader may still set `step` (and `step_plugin` beside it) on a returned candidate — doing
 * so *is* the tool-stated fact, read straight off the tool's own file, and the caller reads
 * that presence to resolve `step_attribution` to `"tool-stated"` rather than falling back to
 * a journal interval. */
export type LocalCostCandidateRecord = Omit<
  TelemetrySinkRecord,
  "sink_schema_version" | "provenance" | "tool" | "step_attribution"
>;

/** What a reader answers with. `sessionFound` separates the two silences a bare empty list
 * conflates: a tool that held this session and recorded nothing billable, and a tool that
 * held no trace of it at all. A report that printed both as zero would let a session read
 * as free when in truth it was never found — the failure this whole layer exists to make
 * impossible. */
export interface LocalCostReadResult {
  readonly records: readonly LocalCostCandidateRecord[];
  readonly sessionFound: boolean;
}

/**
 * What a per-tool local reader promises: given the session identity a run-journal entry
 * already carries, return the records that tool's own file holds for it — nothing more,
 * nothing else joined in. `read` never throws when the tool wrote no file for that
 * session; it answers `sessionFound: false` with no records, which is a session this tool
 * has no trace of rather than an error.
 *
 * Every returned record's `vendor_id` equals the `sessionId` passed in, so a caller never
 * resolves identity twice. `turn_id`, when the tool's file carries a stable per-record
 * identifier, is how a re-read is matched against what is already stored — a reader whose
 * tool has none leaves `turn_id` unset rather than inventing one; a synthesised key that is
 * not stable across reads is worse than an absent one, and records left unmatched by one
 * are simply appended again rather than deduplicated.
 */
export interface SessionCostReader {
  read(sessionId: string): Promise<LocalCostReadResult>;
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
