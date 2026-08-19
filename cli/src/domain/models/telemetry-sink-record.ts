import { UnknownTelemetrySinkSchemaVersionError } from "../errors.js";

export const SINK_SCHEMA_VERSION = 1;

/** A billed request joins to a turn; a session-level measure never does — metric
 * datapoints carry no turn identifier on any tool measured so far. */
export type TelemetrySinkRecordKind = "request" | "session";

/**
 * The tool-neutral stored line. `vendor_field` (and `turn_field`, when present) name the
 * export-side attribute a value came from, because that attribute differs per tool —
 * `session.id` on Claude Code, `conversation.id` on Codex, `gen_ai.conversation.id` on
 * Copilot, `cursor.conversation.id` on Cursor. Every other field is an allowlist: this
 * type is the complete list of what a session is allowed to leave behind.
 */
export interface TelemetrySinkRecord {
  readonly sink_schema_version: number;
  readonly kind: TelemetrySinkRecordKind;
  readonly vendor_id: string;
  readonly vendor_field: string;
  readonly turn_id?: string;
  readonly turn_field?: string;
  readonly project_id?: string;
  readonly user_id?: string;
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
}

/** What a tool's export uses as the session identity, and (when it has one) the turn
 * identifier — gathered from every measured `AiTool.telemetryExport` by the caller, never
 * hardcoded here. This is the only thing that varies the mapper's behavior per tool, and
 * it arrives as data, not as a branch. */
export interface TelemetryVendorIdentity {
  readonly identityAttribute: string;
  readonly turnAttribute?: string;
}

/**
 * One `/v1/metrics` datapoint a tool's export carries, and which allowlisted field it
 * fills. `whenAttribute`/`whenValue` select among datapoints of the same metric name that
 * differ only by an attribute — Claude Code reports all four token counts under
 * `claude_code.token.usage`, distinguished by `type`. Declared per tool (see
 * `claude-telemetry.ts`), never matched here by name.
 */
export interface TelemetrySessionMeasure {
  readonly metric: string;
  readonly field: keyof TelemetrySinkRecord;
  readonly whenAttribute?: string;
  readonly whenValue?: string;
}

type AttributeValue = string | number | boolean;

/** The record under construction. A mutable object is assignable to the readonly
 * interface, so building one costs no cast — and a cast is how a field outside the
 * allowlist would slip in unnoticed. */
type SinkRecordDraft = { -readonly [K in keyof TelemetrySinkRecord]: TelemetrySinkRecord[K] };

const COST_ATTRIBUTE = "cost_usd";

const ATTRIBUTE_ALLOWLIST: ReadonlyMap<string, keyof TelemetrySinkRecord> = new Map([
  ["aidd.project_id", "project_id"],
  ["user.id", "user_id"],
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
]);

const NUMERIC_FIELDS: ReadonlySet<keyof TelemetrySinkRecord> = new Set([
  "cost_usd",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_creation_tokens",
  "duration_ms",
  "active_time_s",
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

function resolveIdentity(
  merged: Map<string, AttributeValue>,
  vendors: readonly TelemetryVendorIdentity[]
): { vendorId: string; vendorField: string; turnId?: string; turnField?: string } | null {
  for (const vendor of vendors) {
    const id = merged.get(vendor.identityAttribute);
    if (typeof id !== "string" || id === "") continue;
    const turn = vendor.turnAttribute ? merged.get(vendor.turnAttribute) : undefined;
    return {
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
  identity: { vendorId: string; vendorField: string; turnId?: string; turnField?: string },
  merged: Map<string, AttributeValue>
): SinkRecordDraft {
  const draft: SinkRecordDraft = {
    sink_schema_version: SINK_SCHEMA_VERSION,
    kind,
    vendor_id: identity.vendorId,
    vendor_field: identity.vendorField,
    turn_id: identity.turnId,
    turn_field: identity.turnId ? identity.turnField : undefined,
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

/** Every log record in a payload, already merged with its resource attributes. Flattening
 * the three nesting levels here keeps each mapper a single loop over what it cares about. */
function* eachLogRecord(payload: unknown): Generator<Map<string, AttributeValue>> {
  const resourceLogs = asReadonlyArray<OtlpResourceLogs>(
    (payload as OtlpLogsPayload)?.resourceLogs
  );
  for (const resourceLog of resourceLogs) {
    const resourceAttrs = attributesToMap(resourceLog?.resource?.attributes);
    for (const scopeLog of asReadonlyArray<OtlpScopeLogs>(resourceLog?.scopeLogs)) {
      for (const logRecord of asReadonlyArray<OtlpLogRecord>(scopeLog?.logRecords)) {
        yield mergeAttributes(resourceAttrs, attributesToMap(logRecord?.attributes));
      }
    }
  }
}

/**
 * Log records that never carry `cost_usd` are not billed requests — hook lifecycle
 * events, plugin loads, tool results — and are dropped here rather than stored under a
 * kind the allowlist does not define. `cost_usd` is an allowlisted attribute name, not a
 * vendor identifier: it selects "was this billed", the same test on every tool measured.
 */
export function mapOtlpLogsToSinkRecords(
  payload: unknown,
  vendors: readonly TelemetryVendorIdentity[]
): TelemetrySinkRecord[] {
  const records: TelemetrySinkRecord[] = [];
  for (const merged of eachLogRecord(payload)) {
    if (!merged.has(COST_ATTRIBUTE)) continue;
    const identity = resolveIdentity(merged, vendors);
    if (identity) records.push(buildBaseRecord("request", identity, merged));
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

/**
 * One line per datapoint, never merged: metrics arrive as separate datapoints (four for
 * token usage alone, distinguished by `type`), and joining them would assume an ordering
 * no tool documents. Datapoints carry no turn identifier on any tool measured so far, so
 * every line here is `kind: "session"`.
 */
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
    records.push(draft);
  }
  return records;
}

export function serializeTelemetrySinkRecord(record: TelemetrySinkRecord): string {
  return JSON.stringify(record);
}

/** The reader half of this format — proven in tests against a fixture the mapper never
 * produced, so the shape survives independently of whatever the receiver happens to emit. */
export function parseTelemetrySinkLine(line: string): TelemetrySinkRecord {
  const parsed = JSON.parse(line) as { sink_schema_version?: unknown };
  if (parsed.sink_schema_version !== SINK_SCHEMA_VERSION) {
    throw new UnknownTelemetrySinkSchemaVersionError(parsed.sink_schema_version);
  }
  return parsed as TelemetrySinkRecord;
}
