import type { LocalCostCandidateRecord } from "../ports/session-cost-reader.js";

// The counters are disjoint — `total == input + output + reasoning + cache.read + cache.write`
// held for every provider captured, with `input` shrinking as `cache.read` climbed — so nothing
// cached is subtracted here. `info.cost` is never read: it reads `0` throughout and its
// denomination is unestablished, a figure whose meaning is unknown being worse than an absent
// one. `info.providerID` is never read either, the stored record carrying no provider field, so
// the residual limit lives in `profiles/opencode/profile.ts`'s `telemetryLocalRead.limitation`.
const VENDOR_FIELD = "sessionID";
const TURN_FIELD = "id";

interface OpencodeTokenCounts {
  readonly total?: unknown;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly cache?: { readonly read?: unknown; readonly write?: unknown };
}

interface OpencodeMessageInfo {
  readonly id?: unknown;
  readonly modelID?: unknown;
  readonly tokens?: OpencodeTokenCounts;
  readonly time?: { readonly created?: unknown; readonly completed?: unknown };
}

interface OpencodeExportPayload {
  readonly messages?: readonly { readonly info?: OpencodeMessageInfo }[];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// Epoch milliseconds. `time.created`, not `time.completed`: completed is absent on some
// counted messages, and a field meaning "started" on one record and "finished" on the next is
// worse than one that always means the same thing.
function isoFromEpochMillis(value: unknown): string | undefined {
  const millis = asNumber(value);
  if (millis === undefined || millis <= 0) return undefined;
  const at = new Date(millis);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

function buildIdentity(
  info: OpencodeMessageInfo,
  sessionId: string
): Pick<LocalCostCandidateRecord, "vendor_id" | "vendor_field" | "turn_id" | "turn_field"> {
  const turnId = asString(info.id);
  return {
    vendor_id: sessionId,
    vendor_field: VENDOR_FIELD,
    ...(turnId !== undefined ? { turn_id: turnId, turn_field: TURN_FIELD } : {}),
  };
}

// `cache.read`/`cache.write` are the same quantities the other tools already call
// cache-read and cache-creation — mapped onto those field names, not OpenCode's own.
function buildCounters(
  tokens: OpencodeTokenCounts
): Pick<
  LocalCostCandidateRecord,
  "input_tokens" | "output_tokens" | "cache_read_tokens" | "cache_creation_tokens"
> {
  const input = asNumber(tokens.input);
  const output = asNumber(tokens.output);
  const cacheRead = asNumber(tokens.cache?.read);
  const cacheWrite = asNumber(tokens.cache?.write);
  return {
    ...(input !== undefined ? { input_tokens: input } : {}),
    ...(output !== undefined ? { output_tokens: output } : {}),
    ...(cacheRead !== undefined ? { cache_read_tokens: cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cache_creation_tokens: cacheWrite } : {}),
  };
}

// A message OpenCode created but never billed — an interrupted response — carries `tokens`
// with no `total` key at all, and is not reliably given a `finish` either, so `total`'s absence
// is the signal. A message that completed with genuinely zero usage still carries `total: 0`
// and still yields a record: that is an observation, not a call that never happened.
function wasBilled(tokens: OpencodeTokenCounts): boolean {
  return asNumber(tokens.total) !== undefined;
}

function buildRecord(
  info: OpencodeMessageInfo,
  sessionId: string
): LocalCostCandidateRecord | null {
  if (info.tokens === undefined) return null;
  if (!wasBilled(info.tokens)) return null;
  const model = asString(info.modelID);
  const at = isoFromEpochMillis(info.time?.created);
  return {
    kind: "request",
    ...buildIdentity(info, sessionId),
    ...(model !== undefined ? { model } : {}),
    ...(at !== undefined ? { event_timestamp: at } : {}),
    ...buildCounters(info.tokens),
  };
}

/** A message with no `info.tokens` — every user turn, and any turn OpenCode never measured —
 * yields no record rather than an invented zero, and so does one never billed (`wasBilled`),
 * which would otherwise inflate the request count. `sessionId` is trusted as given, matching
 * every other local reader's contract. */
export function mapOpencodeExportToSinkRecords(
  payload: unknown,
  sessionId: string
): readonly LocalCostCandidateRecord[] {
  const messages = (payload as OpencodeExportPayload)?.messages ?? [];
  const records: LocalCostCandidateRecord[] = [];
  for (const message of messages) {
    const record = buildRecord(message?.info ?? {}, sessionId);
    if (record) records.push(record);
  }
  return records;
}
