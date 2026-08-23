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
 * changes the moment the tool appends anything else to the same record. */
export type TelemetrySinkRecordKind = "request" | "session";

/** Which route produced this line. Never optional: a default meaning "the old route"
 * would make the field unreadable the day a third route appears. */
export type TelemetrySinkRecordProvenance = "export" | "local-read";

/** The tool-neutral stored line, and the complete allowlist of what a session may leave
 * behind — no identity of any kind on an export-provenance record; a person is named only
 * via `person_id`, opted into on the local-read route (see `read-local-cost-use-case.ts`).
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
   * derived from `user_id`, a tool's own attribute, and never set on an export-provenance
   * record (see `read-local-cost-use-case.ts`). Absent whenever nobody opted in, which is
   * the default. */
  readonly person_id?: string;
  /** A separate, later choice from `person_id` - present only once asked for, and never
   * derived from it or from anything else. */
  readonly person_display_name?: string;
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

/** The only thing that varies the mapper per tool, and it arrives as data, not a branch.
 * The caller gathers it from every measured `AiTool.telemetryExport`. `tool` is the
 * declaration's own identifier, carried alongside the attribute so the mapper can stamp
 * which tool matched without branching on `identityAttribute`'s value. */
export interface TelemetryVendorIdentity {
  readonly tool: AiToolId;
  readonly identityAttribute: string;
  readonly turnAttribute?: string;
}

/** One `/v1/metrics` datapoint and the allowlisted field it fills.
 * `whenAttribute`/`whenValue` select among datapoints sharing a metric name that differ
 * only by an attribute. */
export interface TelemetrySessionMeasure {
  readonly metric: string;
  readonly field: keyof TelemetrySinkRecord;
  readonly whenAttribute?: string;
  readonly whenValue?: string;
}

type AttributeValue = string | number | boolean;

/** Mutable while building; assignable to the readonly interface without a cast. */
type SinkRecordDraft = { -readonly [K in keyof TelemetrySinkRecord]: TelemetrySinkRecord[K] };

const COST_ATTRIBUTE = "cost_usd";

// Deliberately excludes `user.id`: a tool's own, uncontrolled user attribute, carried
// whenever an export happens to set it regardless of consent — the opposite of
// `person_id`, which is opted into per person on the local-read route alone.
const ATTRIBUTE_ALLOWLIST: ReadonlyMap<string, keyof TelemetrySinkRecord> = new Map([
  ["aidd.project_id", "project_id"],
  ["request_id", "billed_request_id"],
  [COST_ATTRIBUTE, "cost_usd"],
  ["input_tokens", "input_tokens"],
  ["output_tokens", "output_tokens"],
  ["cache_read_tokens", "cache_read_tokens"],
  ["cache_creation_tokens", "cache_creation_tokens"],
  ["model", "model"],
  ["effort", "effort"],
  ["speed", "speed"],
  ["query_source", "query_source"],
  ["agent.name", "agent_name"],
  ["duration_ms", "duration_ms"],
  ["event.timestamp", "event_timestamp"],
  ["event.sequence", "event_sequence"],
]);

const NUMERIC_FIELDS: ReadonlySet<keyof TelemetrySinkRecord> = new Set([
  "cost_usd",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_creation_tokens",
  "duration_ms",
  "active_time_s",
  "event_sequence",
]);

interface OtlpAnyValue {
  readonly stringValue?: string;
  readonly intValue?: string | number;
  readonly doubleValue?: number;
  readonly boolValue?: boolean;
}

interface OtlpKeyValue {
  readonly key?: string;
  readonly value?: OtlpAnyValue;
}

interface OtlpNumberDataPoint {
  readonly attributes?: readonly OtlpKeyValue[];
  readonly asDouble?: number;
  readonly asInt?: string | number;
  readonly timeUnixNano?: string | number;
}

interface OtlpMetric {
  readonly name?: string;
  readonly sum?: { readonly dataPoints?: readonly OtlpNumberDataPoint[] };
  readonly gauge?: { readonly dataPoints?: readonly OtlpNumberDataPoint[] };
}

interface OtlpScopeMetrics {
  readonly metrics?: readonly OtlpMetric[];
}

interface OtlpResourceMetrics {
  readonly resource?: { readonly attributes?: readonly OtlpKeyValue[] };
  readonly scopeMetrics?: readonly OtlpScopeMetrics[];
}

interface OtlpMetricsPayload {
  readonly resourceMetrics?: readonly OtlpResourceMetrics[];
}

interface OtlpLogRecord {
  readonly attributes?: readonly OtlpKeyValue[];
  readonly timeUnixNano?: string | number;
}

// Every OTLP record carries its own moment in `timeUnixNano`, and no captured payload has
// ever carried the `event.timestamp` attribute the allowlist also accepts. Without reading
// it, an exported record has no moment at all — so a report asking what a week cost could
// only place it by the day the line was appended, which is when it was received rather
// than when the work ran. Nanoseconds since the epoch, as a string on every payload
// measured; `Number` is exact to the millisecond this converts to well past year 2200.
const NANOSECONDS_PER_MILLISECOND = 1e6;

function isoFromUnixNano(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const nanos = Number(value);
  if (!Number.isFinite(nanos) || nanos <= 0) return undefined;
  const at = new Date(Math.floor(nanos / NANOSECONDS_PER_MILLISECOND));
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

interface OtlpScopeLogs {
  readonly logRecords?: readonly OtlpLogRecord[];
}

interface OtlpResourceLogs {
  readonly resource?: { readonly attributes?: readonly OtlpKeyValue[] };
  readonly scopeLogs?: readonly OtlpScopeLogs[];
}

interface OtlpLogsPayload {
  readonly resourceLogs?: readonly OtlpResourceLogs[];
}

function unwrapAnyValue(value: OtlpAnyValue | undefined): AttributeValue | undefined {
  if (!value) return undefined;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.intValue !== undefined) return Number(value.intValue);
  if (value.boolValue !== undefined) return value.boolValue;
  return undefined;
}

function attributesToMap(attrs: readonly OtlpKeyValue[] | undefined): Map<string, AttributeValue> {
  const map = new Map<string, AttributeValue>();
  for (const attr of attrs ?? []) {
    if (!attr.key) continue;
    const value = unwrapAnyValue(attr.value);
    if (value !== undefined) map.set(attr.key, value);
  }
  return map;
}

function mergeAttributes(
  resource: Map<string, AttributeValue>,
  record: Map<string, AttributeValue>
): Map<string, AttributeValue> {
  return new Map([...resource, ...record]);
}

/** The tool the mapper matched, and nothing else — computed once by `resolveIdentity` and
 * reused by both `buildBaseRecord` callers, rather than re-derived from `vendorField`. */
interface ResolvedIdentity {
  readonly tool: AiToolId;
  readonly vendorId: string;
  readonly vendorField: string;
  readonly turnId?: string;
  readonly turnField?: string;
}

function resolveIdentity(
  merged: Map<string, AttributeValue>,
  vendors: readonly TelemetryVendorIdentity[]
): ResolvedIdentity | null {
  for (const vendor of vendors) {
    const id = merged.get(vendor.identityAttribute);
    if (typeof id !== "string" || id === "") continue;
    const turn = vendor.turnAttribute ? merged.get(vendor.turnAttribute) : undefined;
    return {
      tool: vendor.tool,
      vendorId: id,
      vendorField: vendor.identityAttribute,
      ...(typeof turn === "string" && turn !== ""
        ? { turnId: turn, turnField: vendor.turnAttribute }
        : {}),
    };
  }
  return null;
}

function setAllowlistedField(
  draft: SinkRecordDraft,
  field: keyof TelemetrySinkRecord,
  value: AttributeValue
): void {
  Object.assign(draft, { [field]: NUMERIC_FIELDS.has(field) ? Number(value) : String(value) });
}

function buildBaseRecord(
  kind: TelemetrySinkRecordKind,
  identity: ResolvedIdentity,
  merged: Map<string, AttributeValue>
): SinkRecordDraft {
  const draft: SinkRecordDraft = {
    sink_schema_version: SINK_SCHEMA_VERSION,
    kind,
    // The only route this file's mappers ever produce — a locally read record is never
    // built here, since it carries no OTLP attribute map to walk.
    provenance: "export",
    tool: identity.tool,
    vendor_id: identity.vendorId,
    vendor_field: identity.vendorField,
    turn_id: identity.turnId,
    turn_field: identity.turnId ? identity.turnField : undefined,
    // The export path has no journal beside it and no exact per-line field of its own —
    // the vendor's own attribute reads `third-party` for every framework skill, which is
    // why it is never read here. Always unattributed, never a guess.
    step_attribution: "unattributed",
  };
  for (const [key, field] of ATTRIBUTE_ALLOWLIST) {
    const value = merged.get(key);
    if (value !== undefined) setAllowlistedField(draft, field, value);
  }
  return draft;
}

function asReadonlyArray<T>(value: unknown): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [];
}

interface MergedLogRecord {
  readonly merged: Map<string, AttributeValue>;
  readonly at: string | undefined;
}

/** Every log record, already merged with its resource attributes, and its own moment. */
function* eachLogRecord(payload: unknown): Generator<MergedLogRecord> {
  const resourceLogs = asReadonlyArray<OtlpResourceLogs>(
    (payload as OtlpLogsPayload)?.resourceLogs
  );
  for (const resourceLog of resourceLogs) {
    const resourceAttrs = attributesToMap(resourceLog?.resource?.attributes);
    for (const scopeLog of asReadonlyArray<OtlpScopeLogs>(resourceLog?.scopeLogs)) {
      for (const logRecord of asReadonlyArray<OtlpLogRecord>(scopeLog?.logRecords)) {
        yield {
          merged: mergeAttributes(resourceAttrs, attributesToMap(logRecord?.attributes)),
          at: isoFromUnixNano(logRecord?.timeUnixNano),
        };
      }
    }
  }
}

/** A log record without `cost_usd` is not a billed request — hook lifecycle events,
 * plugin loads, tool results — and is dropped. */
export function mapOtlpLogsToSinkRecords(
  payload: unknown,
  vendors: readonly TelemetryVendorIdentity[]
): TelemetrySinkRecord[] {
  const records: TelemetrySinkRecord[] = [];
  for (const { merged, at } of eachLogRecord(payload)) {
    if (!merged.has(COST_ATTRIBUTE)) continue;
    const identity = resolveIdentity(merged, vendors);
    if (!identity) continue;
    const draft = buildBaseRecord("request", identity, merged);
    // The attribute wins where a payload carries both: it is the tool's own statement of
    // when the event happened, while `timeUnixNano` is when the record was emitted.
    if (draft.event_timestamp === undefined && at !== undefined) draft.event_timestamp = at;
    records.push(draft);
  }
  return records;
}

function resolveMeasureField(
  measures: readonly TelemetrySessionMeasure[],
  metricName: string | undefined,
  attrs: Map<string, AttributeValue>
): TelemetrySessionMeasure | null {
  if (!metricName) return null;
  for (const measure of measures) {
    if (measure.metric !== metricName) continue;
    if (!measure.whenAttribute) return measure;
    if (attrs.get(measure.whenAttribute) === measure.whenValue) return measure;
  }
  return null;
}

interface MetricDataPoint {
  readonly metricName: string | undefined;
  readonly dataPoint: OtlpNumberDataPoint;
  readonly resourceAttrs: Map<string, AttributeValue>;
}

function* eachMetricDataPoint(payload: unknown): Generator<MetricDataPoint> {
  const resourceMetrics = asReadonlyArray<OtlpResourceMetrics>(
    (payload as OtlpMetricsPayload)?.resourceMetrics
  );
  for (const resourceMetric of resourceMetrics) {
    const resourceAttrs = attributesToMap(resourceMetric?.resource?.attributes);
    for (const scopeMetric of asReadonlyArray<OtlpScopeMetrics>(resourceMetric?.scopeMetrics)) {
      for (const metric of asReadonlyArray<OtlpMetric>(scopeMetric?.metrics)) {
        const points = metric?.sum?.dataPoints ?? metric?.gauge?.dataPoints;
        for (const dataPoint of asReadonlyArray<OtlpNumberDataPoint>(points)) {
          yield { metricName: metric?.name, dataPoint, resourceAttrs };
        }
      }
    }
  }
}

function numericValue(dataPoint: OtlpNumberDataPoint): number | undefined {
  if (dataPoint.asDouble !== undefined) return dataPoint.asDouble;
  return dataPoint.asInt !== undefined ? Number(dataPoint.asInt) : undefined;
}

/** One line per datapoint, never merged: joining them would assume an ordering no tool
 * documents. No datapoint measured so far carries a turn identifier, so every line is
 * `kind: "session"`. */
export function mapOtlpMetricsToSinkRecords(
  payload: unknown,
  vendors: readonly TelemetryVendorIdentity[],
  sessionMeasures: readonly TelemetrySessionMeasure[]
): TelemetrySinkRecord[] {
  const records: TelemetrySinkRecord[] = [];
  for (const { metricName, dataPoint, resourceAttrs } of eachMetricDataPoint(payload)) {
    const attrs = attributesToMap(dataPoint?.attributes);
    const measure = resolveMeasureField(sessionMeasures, metricName, attrs);
    const value = numericValue(dataPoint);
    if (!measure || value === undefined) continue;
    const merged = mergeAttributes(resourceAttrs, attrs);
    const identity = resolveIdentity(merged, vendors);
    if (!identity) continue;
    const draft = buildBaseRecord("session", identity, merged);
    setAllowlistedField(draft, measure.field, value);
    const at = isoFromUnixNano(dataPoint?.timeUnixNano);
    if (draft.event_timestamp === undefined && at !== undefined) draft.event_timestamp = at;
    records.push(draft);
  }
  return records;
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
  if (at === undefined) return undefined;
  if (at.length >= DAY_KEY_LENGTH && at.endsWith("Z")) return at.slice(0, DAY_KEY_LENGTH);
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, DAY_KEY_LENGTH);
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
