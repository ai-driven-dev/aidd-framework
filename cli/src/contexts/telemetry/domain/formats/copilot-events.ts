import type { LocalCostCandidateRecord } from "../ports/session-cost-reader.js";

// `session.shutdown` fires once at the end of a session, never per turn, and its `tokenDetails`
// is exclusive of the cache figures where the sibling `usage` object is inclusive of them —
// which is why this reader takes the first. `requests.cost` and `totalPremiumRequests` are a
// count times a per-model multiplier, invariant to consumption, so neither is read as `cost_usd`;
// no `model` is stamped either, `currentModel` naming only the last one a session used.
const VENDOR_FIELD = "sessionId";
const TURN_FIELD = "id";

interface CopilotTokenCount {
  readonly tokenCount?: unknown;
}

interface CopilotShutdownData {
  readonly tokenDetails?: {
    readonly input?: CopilotTokenCount;
    readonly output?: CopilotTokenCount;
    readonly cache_read?: CopilotTokenCount;
    readonly cache_write?: CopilotTokenCount;
  };
}

interface CopilotEventLine {
  readonly type?: unknown;
  readonly id?: unknown;
  readonly timestamp?: unknown;
  readonly data?: CopilotShutdownData;
}

interface CopilotCounters {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_creation_tokens: number;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** All four or none: a shape this file has not been taught — a renamed field, an empty
 * `tokenDetails` — yields no record rather than one silently missing every counter. */
function readCounters(details: CopilotShutdownData["tokenDetails"]): CopilotCounters | null {
  const input = asNumber(details?.input?.tokenCount);
  const output = asNumber(details?.output?.tokenCount);
  const cacheRead = asNumber(details?.cache_read?.tokenCount);
  const cacheWrite = asNumber(details?.cache_write?.tokenCount);
  if (input === undefined || output === undefined) return null;
  if (cacheRead === undefined || cacheWrite === undefined) return null;
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: cacheRead,
    cache_creation_tokens: cacheWrite,
  };
}

function buildRecord(
  line: CopilotEventLine,
  vendorId: string,
  counters: CopilotCounters
): LocalCostCandidateRecord {
  const turnId = asString(line.id);
  const timestamp = asString(line.timestamp);
  return {
    kind: "session",
    vendor_id: vendorId,
    vendor_field: VENDOR_FIELD,
    ...(turnId !== undefined ? { turn_id: turnId, turn_field: TURN_FIELD } : {}),
    ...(timestamp !== undefined ? { event_timestamp: timestamp } : {}),
    ...counters,
  };
}

function parseLine(line: string): CopilotEventLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as CopilotEventLine;
  } catch {
    return null;
  }
}

/** One record at most: no per-request figure exists on this tool's file at all, and a session
 * that never shut down or shut down unbilled yields nothing rather than a record of zeros.
 * `vendorId` is the caller's own — the directory already names the session, where a truncated
 * copy of the file would not — and this stays pure; the adapter is what opens a file. */
export function mapCopilotEventsToSinkRecords(
  content: string,
  vendorId: string
): readonly LocalCostCandidateRecord[] {
  for (const raw of content.split("\n")) {
    const parsed = parseLine(raw);
    if (parsed?.type !== "session.shutdown") continue;
    const counters = readCounters(parsed.data?.tokenDetails);
    if (counters === null) continue;
    return [buildRecord(parsed, vendorId, counters)];
  }
  return [];
}
