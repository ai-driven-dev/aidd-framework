import type { LocalCostCandidateRecord } from "../../../telemetry/domain/ports/session-cost-reader.js";

// Measured 2026-08-21/22 against real files on `@github/copilot@1.0.80`:
// ~/.copilot/session-state/<id>/events.jsonl. `session.shutdown` fires once, at the end of
// the session — never per turn — and its own `tokenDetails` is the four-counter breakdown
// this reader carries. Confirmed arithmetically against the same capture:
// `tokenDetails.input.tokenCount` (10) + `tokenDetails.cache_write.tokenCount` (21070) =
// `modelMetrics.<model>.usage.inputTokens` (21080) — the `usage` object is *inclusive* of
// the cache-write figure, `tokenDetails` already exclusive, matching every other reader's
// convention here. `modelMetrics.<model>.requests.cost` (and its session-level twin,
// `totalPremiumRequests`) is a count times a per-model multiplier, invariant to
// consumption — measured across fourteen local sessions, it read `0.33` for every
// single-request `claude-haiku-4.5` session regardless of tokens spent — so neither is ever
// read as `cost_usd`. No `model` is stamped either: `currentModel` names only the last
// model a session used, and `session.model_change` is a real, captured event, so
// attributing a whole session's tokens to it would repeat the sticky-attribution mistake
// this codebase already corrected for `skill.name`.
//
// The session id is never read off the file's own content — `session.shutdown` carries
// none, and reading it from a preceding `session.start` line would give the file's own
// answer rather than the session the caller already asked for, the one case where the two
// could disagree (a truncated capture, a copy missing its first line). The directory this
// file lives in already names the session; `CopilotCostReaderAdapter` reads that name once
// and hands it straight through.
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

/** All four or none — every real capture reports them together, and a shape this file has
 * not been taught (a renamed field, a `tokenDetails` present but empty) must yield no
 * record rather than one silently missing every counter. */
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

/**
 * One record at most, from `session.shutdown`'s own `tokenDetails` — never per turn, since
 * no per-request figure exists on this tool's file at all. A session that never
 * shut down, or one that shut down with no billed request (no `tokenDetails` at all,
 * `modelMetrics: {}`), yields nothing: a session held and found empty, never a record of
 * zeros. Only the first matching line is kept — `session.shutdown` fires once.
 *
 * `vendorId` is the caller's own — never re-derived from the file, see the header comment
 * above for why. Pure and synchronous: the one part of this reader allowed to open a file
 * is `CopilotCostReaderAdapter`, which calls this with what it read.
 */
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
