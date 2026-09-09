import { UnknownTelemetrySinkSchemaVersionError } from "../../../kernel/errors.js";
import type { AiToolId } from "../../../kernel/tool.js";
import type { StepAttributionSource } from "./step-attribution.js";

// v2 adds `provenance`, required rather than defaulted: a default meaning "the old route"
// is exactly the ambiguity the field exists to remove.
export const SINK_SCHEMA_VERSION = 2;

/** `turn_id` is the key a re-read deduplicates on - the tool's own identifier, never a hash
 * of the line, which changes the moment the tool appends to the record. No field says a
 * record was provisional when stored: nothing outliving the moment of a read could confirm
 * it closed, so what is stored is every reading strictly larger than the last. */
export type TelemetrySinkRecordKind = "request" | "session";

/** Which route produced this line. Never optional: a default meaning "the old route" would
 * make the field unreadable the day a third route appears. `"export"` can no longer be
 * *produced* by this system, but stays in the union and every reader keeps honouring it,
 * because a stored line outlives the code that wrote it. */
export type TelemetrySinkRecordProvenance = "export" | "local-read";

/** The tool-neutral stored line, and the complete allowlist of what a session may leave
 * behind: no identity of any kind on a *stored* export-provenance record, a person being
 * named only via `person_id`, opted into on the local-read route. `vendor_field` and
 * `turn_field` name the export-side attribute a value came from, which differs per tool. */
export interface TelemetrySinkRecord {
  readonly sink_schema_version: number;
  readonly kind: TelemetrySinkRecordKind;
  readonly provenance: TelemetrySinkRecordProvenance;
  readonly tool: AiToolId;
  readonly vendor_id: string;
  readonly vendor_field: string;
  readonly turn_id?: string;
  readonly turn_field?: string;
  /** The tool's own identifier for one billed call, not one turn - present only where a
   * route can name it and, unlike `turn_id`, unique per billed request wherever present. It
   * exists so a report can collapse two records describing one call into one, and is never
   * used for the local-read re-read match `turn_id` exists for. */
  readonly billed_request_id?: string;
  /** The prompt this billed call belongs to. A billed call and the prompt that caused it
   * never share a transcript line, so the reader follows `parentUuid` back to one; the run
   * journal writes the same identifier on `step_start`, so matching the two joins a step to
   * a record exactly rather than inferring it from overlapping intervals. */
  readonly prompt_id?: string;
  /** The skill a `Skill` call invoked inside this record's own prompt, stored because the
   * report never re-reads a transcript. Scoped to the transcript the record sits in: a
   * subagent that invoked its own skill did that work under it, so merging a prompt's
   * several files first would pick one name for both. */
  readonly prompt_skill?: string;
  /** How `step` came to be known. Never optional, for the same reason `provenance` is not:
   * an absent field would read as "no step ran", the one assertion nothing on a transcript
   * or a journal can support. */
  readonly step_attribution: StepAttributionSource;
  /** Present only where `step_attribution` names a source that found one; absent, never a
   * placeholder, when `step_attribution` is `"unattributed"`. */
  readonly step?: string;
  /** The plugin a tool-stated `step` came bundled with, when the tool reports one
   * alongside the skill name. Never set from a journal interval, which carries no plugin
   * at all. */
  readonly step_plugin?: string;
  readonly project_id?: string;
  /** Which field on the run journal's `session_start` line `project_id` came from, present
   * only on a record joined from a journal. Absent on an export-provenance record, whose
   * `project_id` is set directly from an OTLP attribute with no join to name a source for. */
  readonly project_field?: string;
  /** The identifier a person chose to attach to records this machine reads locally - never
   * derived from `user_id`, a tool's own attribute, and never written onto an
   * export-provenance record. Absent whenever nobody opted in, which is the default. */
  readonly person_id?: string;
  /** A separate, later choice from `person_id` - present only once asked for, and never
   * derived from it or from anything else. */
  readonly person_display_name?: string;
  /** The CLI's own version, stamped only on what the CLI itself stored - a `provenance:
   * "local-read"` record, never an `"export"` one. Never the framework's version and never
   * the plugin's, which stamps the journal line beside this record instead. Absent on a
   * record written before this field existed, which reads as an unknown version. */
  readonly cli_version?: string;
  readonly cost_usd?: number;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_tokens?: number;
  readonly cache_creation_tokens?: number;
  readonly model?: string;
  readonly effort?: string;
  readonly speed?: string;
  readonly query_source?: string;
  readonly agent_name?: string;
  readonly duration_ms?: number;
  readonly active_time_s?: number;
  readonly event_timestamp?: string;
  readonly event_sequence?: number;
}

const DAY_KEY_LENGTH = "YYYY-MM-DD".length;

/** The UTC day a record's own moment falls on, or `undefined` when it carries none. Lives
 * here rather than in the sink adapter because the adapter and every double standing in for
 * it must agree, and two implementations of "which day is this" diverge on exactly the
 * inputs nobody writes a fixture for. */
export function telemetrySinkRecordDayKey(record: TelemetrySinkRecord): string | undefined {
  const at = record.event_timestamp;
  // `typeof`, not `!== undefined`: `parseTelemetrySinkLine` checks the schema version and
  // casts the rest, so a number here would parse as epoch milliseconds, land outside every
  // real period and go missing from the read without being counted as undated.
  if (typeof at !== "string") return undefined;
  // The parse is checked first, always: the slice below is a faster way to read a moment
  // already known to parse, never a substitute for checking it does. Slicing first lets a
  // string merely shaped like a moment ("not-a-momentZ") answer a calendar fragment.
  const parsed = new Date(at);
  if (Number.isNaN(parsed.getTime())) return undefined;
  if (at.length >= DAY_KEY_LENGTH && at.endsWith("Z")) return at.slice(0, DAY_KEY_LENGTH);
  return parsed.toISOString().slice(0, DAY_KEY_LENGTH);
}

export function serializeTelemetrySinkRecord(record: TelemetrySinkRecord): string {
  return JSON.stringify(record);
}

export function parseTelemetrySinkLine(line: string): TelemetrySinkRecord {
  const parsed = JSON.parse(line) as { sink_schema_version?: unknown };
  if (parsed.sink_schema_version !== SINK_SCHEMA_VERSION) {
    throw new UnknownTelemetrySinkSchemaVersionError(parsed.sink_schema_version);
  }
  return parsed as TelemetrySinkRecord;
}
