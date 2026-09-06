import { UnknownTelemetrySinkSchemaVersionError } from "../errors.js";
import type { StepAttributionSource } from "./step-attribution.js";
import type { AiToolId } from "./tool-ids.js";

// v2 adds `provenance`, required rather than defaulted, because a default meaning "the
// old route" is exactly the ambiguity the field exists to remove. No migration: the sink
// is delivered but unmerged, so no v1 day file exists outside this branch to migrate.
export const SINK_SCHEMA_VERSION = 2;

/** A request-kind record joins to a turn when its route can name one — an OTLP `api_request`
 * names it via `turn_field`, a local read names it via the tool's own per-record id. A
 * session-level measure never does — metric datapoints carry no turn identifier on any
 * tool measured so far. `turn_id`, when present, is also the key a re-read is deduplicated
 * on: the tool's own identifier for that record, never a hash of the line, since a hash
 * changes the moment the tool appends anything else to the same record.
 *
 * No field here says a `kind: "request"` local-read record was still provisional when it
 * was stored — a record read while its turn might still be running looks exactly like one
 * read after it finished. That is deliberate: a stored line is never later confirmed closed
 * or reopened, because there is nothing to confirm it against that outlives the moment a
 * read happened — a run journal's own `turn_end` line says only that no further growth is
 * coming, never that a given stored reading already saw all of it, and gating a correction
 * on it would risk freezing a partial reading the instant a `turn_end` line existed at all.
 * What *is* stored is every reading a later read judged a genuine, strictly larger
 * improvement on the last — never a smaller one, and never a redundant one once a re-read
 * brings nothing more (see `read-local-cost-use-case.ts`'s `storeNewCandidates` and
 * `cost-report.ts`'s `collapseSupersededTurns`, which then keeps only the largest of
 * however many readings a turn accumulated). */
export type TelemetrySinkRecordKind = "request" | "session";

/** Which route produced this line. Never optional: a default meaning "the old route"
 * would make the field unreadable the day a third route appears.
 *
 * `"export"` can no longer be *produced* by this system — the OTLP receiver, the export
 * config reader/writer, and the mapper that turned an OTLP payload into a record were all
 * deleted in "one route, and every sentence about it true"
 * (aidd_docs/tasks/2026_08/2026_08_28_one-route-that-is-true/). It stays in this union, and
 * every reader keeps honouring it, because a stored line outlives the code that wrote it: a
 * record an earlier version of this tool wrote to someone's real sink must stay readable,
 * countable, and reportable, exactly as before. Removing a way of writing never removes a
 * way of reading. */
export type TelemetrySinkRecordProvenance = "export" | "local-read";

/** The tool-neutral stored line, and the complete allowlist of what a session may leave
 * behind — no identity of any kind on a *stored* export-provenance record; a person is
 * named only via `person_id`, opted into on the local-read route (see
 * `read-local-cost-use-case.ts`). This is a statement about what is written to disk, not
 * about every in-memory record with `provenance: "export"`: `cost-report.ts`'s
 * `withPersonBackfill` is the one place that pairs an export-route record with its
 * local-read sibling for the same billed call at read time, and copies the sibling's
 * `person_id` and `person_display_name` onto it, as a pair, before the report is built —
 * see that function's own doc comment.
 * `vendor_field` and `turn_field` name the export-side attribute a value came
 * from, since that attribute differs per tool — `tool` names the tool itself, so no
 * consumer ever has to reverse that attribute back into an identity. Never optional: an
 * unnamed record is exactly the ambiguity this field exists to remove. */
export interface TelemetrySinkRecord {
  readonly sink_schema_version: number;
  readonly kind: TelemetrySinkRecordKind;
  readonly provenance: TelemetrySinkRecordProvenance;
  readonly tool: AiToolId;
  readonly vendor_id: string;
  readonly vendor_field: string;
  readonly turn_id?: string;
  readonly turn_field?: string;
  /** The tool's own identifier for one billed call, not one turn — present only where a
   * route can name it, and, unlike `turn_id`, guaranteed unique per billed request where it
   * is present at all. Claude Code names the same call `requestId` on its local transcript
   * and `request_id` on its export's `api_request` log attribute — the one identifier this
   * sink has ever measured both routes computing for the same real call. It exists so a
   * report can collapse two records describing one call, made when both routes are live for
   * a tool, into one — see "One billed call, both routes" in metrics-contract.md. Never used
   * for the local-read re-read match `turn_id` exists for. */
  readonly billed_request_id?: string;
  /** The prompt this billed call belongs to, where its tool's own files can say.
   *
   * A billed call and the prompt that caused it never share a transcript line — measured on
   * a real 810-record session, zero lines carry both `requestId` and `promptId`, and only
   * `type: "user"` lines carry the second. Every line bearing counters reaches one by
   * following `parentUuid`, three hops in the median, which is how the reader resolves it.
   *
   * The run journal writes the same identifier on `step_start` (Claude Code hands its hooks
   * `prompt_id`, stored there under the name `turn_id`). Matching the two joins a step to a
   * record **exactly**, instead of inferring it from which interval each moment happens to
   * fall in — the one route that stays true when two tasks advance at once, since two
   * prompts remain two prompts however their moments overlap.
   *
   * Absent wherever a tool's files cannot say, which is every host but Claude Code today. */
  readonly prompt_id?: string;
  /** The skill a `Skill` call invoked inside this record's own prompt — the same fact the
   * run journal writes as `step_start`'s `turn_id`, seen from the transcript instead.
   *
   * Stored because the report never re-reads a transcript: it reads this sink and the
   * journals beside it, so an observation only a transcript holds has to be written down
   * when it is read or it is gone. An observation, and never a judgement — which step a
   * record belongs to is `report-cost-use-case.ts`'s question, derived fresh every run
   * from this and from the journal together.
   *
   * Scoped to the transcript the record itself sits in, which is what the reader accumulates:
   * Claude Code writes a session's subagents to their own files under
   * `<sessionId>/subagents/`, and a prompt is often spread across several — measured on one
   * machine, 1,038 of 5,564 prompts appear in more than one file. A subagent that invoked its
   * own skill did that work under that skill, so its records name it, while the main
   * transcript's records name whatever the main flow invoked. Merging the files first would
   * have to pick one of the two for both, and neither choice is true of both.
   *
   * It does not duplicate `step`. That one reads `attributionSkill`, which Claude Code
   * writes per message: exact where it appears and sparse where it does not. Measured on
   * the one orchestrated session captured, 2026-09-04, inside the window
   * `aidd-dev:01-plan` demonstrably ran, 142 lines carry counters and 20 carry that field.
   * So its absence is not the tool saying no skill ran, and naming the skill a prompt
   * invoked contradicts nothing the tool states. */
  readonly prompt_skill?: string;
  /** How `step` came to be known. Never optional, for the same reason `provenance` is not:
   * an absent field would be read as "no step ran", which is exactly the assertion nothing
   * on a transcript or a journal can support. See `domain/models/step-attribution.ts`. */
  readonly step_attribution: StepAttributionSource;
  /** The skill or step name — present only where `step_attribution` names a source that
   * actually found one; absent, never a placeholder, when `step_attribution` is
   * `"unattributed"`. */
  readonly step?: string;
  /** The plugin a tool-stated `step` came bundled with, when the tool reports one
   * alongside the skill name. Never set from a journal interval, which carries no plugin
   * at all. */
  readonly step_plugin?: string;
  readonly project_id?: string;
  /** Which field on the run journal's `session_start` line `project_id` came from —
   * `"project_remote"` or `"project_id"`, present only on a record joined from a journal
   * (see `domain/models/session-project.ts`). Absent on an export-provenance record: its
   * `project_id` is set directly from the `aidd.project_id` OTLP attribute, with no
   * journal join to name a source for. */
  readonly project_field?: string;
  /** The identifier a person chose to attach to records this machine reads locally - never
   * derived from `user_id`, a tool's own attribute, and never *written* onto an
   * export-provenance record (see `read-local-cost-use-case.ts`). Absent whenever nobody
   * opted in, which is the default. `cost-report.ts`'s `withPersonBackfill` is the one
   * read-time exception: it can carry an export-route record's `person_id` in memory,
   * backfilled onto it from its local-read sibling for the same billed call, as a pair with
   * `person_display_name`, never one field from each - see that function's doc comment and
   * the interface comment above. */
  readonly person_id?: string;
  /** A separate, later choice from `person_id` - present only once asked for, and never
   * derived from it or from anything else. */
  readonly person_display_name?: string;
  /** The CLI's own version, read through the same port `current-version-adapter.ts` already
   * resolves it through, stamped only on what the CLI itself stored — a `provenance:
   * "local-read"` record, never a `provenance: "export"` one, the same restriction
   * `person_id`'s own comment states for the same reason: the export route's records were
   * never produced by this CLI at all (a different process, a tool's own SDK, gone even
   * earlier - see `TelemetrySinkRecordProvenance`), so there is no version of *this tool*
   * to name on one. Never the framework's own version, which stored nothing here, and never
   * the plugin's, which stamps only the journal line beside this record (see
   * `RunJournalSessionStart.plugin_version`) — two different fields, two different
   * producers, two different values. Absent on a record written before this field existed,
   * which reads as an unknown version, never as a default or a guess. */
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

/** The UTC day a record's own moment falls on, or `undefined` when it carries none.
 *
 * Lives here rather than in the sink adapter because more than one thing has to agree on
 * it — the adapter that reads day files and every double that stands in for it — and two
 * implementations of "which day is this" diverge on exactly the inputs nobody writes a
 * fixture for. ISO 8601 with a `Z` offset is what every producer writes, so the first ten
 * characters are already the UTC day; anything else is parsed rather than sliced, so a
 * moment written with a non-UTC offset lands on the day it actually happened
 * (`2026-08-18T01:00:00+05:00` is the 17th) and an unparseable one answers `undefined`
 * rather than a sliced fragment. */
export function telemetrySinkRecordDayKey(record: TelemetrySinkRecord): string | undefined {
  const at = record.event_timestamp;
  // `typeof`, not `!== undefined`: `parseTelemetrySinkLine` checks the schema version and
  // casts the rest, so this field holds whatever its line held. A number passes an
  // `undefined` check and `new Date(12345)` is a valid moment — epoch milliseconds — so the
  // record would have been placed on 1970-01-01, fallen outside every real period, and gone
  // missing from the read without ever being counted as undated.
  if (typeof at !== "string") return undefined;
  // The parse is checked first, always - the fast slice below is only ever a faster way to
  // read a moment already known to parse, never a substitute for checking it does. Slicing
  // first and parsing only for the rest let a string merely shaped like a moment
  // ("not-a-momentZ") answer a fragment nothing on the calendar matches, instead of the
  // `undefined` this function's whole contract promises for anything that isn't one.
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
