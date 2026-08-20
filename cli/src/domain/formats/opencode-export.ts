import type { LocalCostCandidateRecord } from "../ports/session-cost-reader.js";

// Measured 2026-08-20 on opencode 1.14.20: `opencode export <sessionID> --sanitize` answers
// `{info, messages}` on stdout, and a counted message's own `info` carries `tokens`
// (`{total, input, output, reasoning, cache:{read, write}}`), `modelID` and a stable `id`.
// `info.cost` is deliberately never read here: it is `0` in every message captured, its
// denomination (which currency, computed vs billed) has never been established, and a
// figure whose meaning is unknown is worse than an absent one.
// `info.providerID` (e.g. "anthropic", sitting right next to `modelID`) is deliberately
// never read either: the stored record has no provider field — `model` everywhere else in
// this codebase already holds a bare model id, not a `provider/model` pair — and inventing
// one here would introduce OpenCode's own vocabulary for something no other reader names.
const VENDOR_FIELD = "sessionID";
const TURN_FIELD = "id";

interface OpencodeTokenCounts {
  readonly input?: unknown;
  readonly output?: unknown;
  readonly cache?: { readonly read?: unknown; readonly write?: unknown };
}

interface OpencodeMessageInfo {
  readonly id?: unknown;
  readonly modelID?: unknown;
  readonly tokens?: OpencodeTokenCounts;
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

function buildRecord(
  info: OpencodeMessageInfo,
  sessionId: string
): LocalCostCandidateRecord | null {
  if (info.tokens === undefined) return null;
  const model = asString(info.modelID);
  return {
    kind: "request",
    ...buildIdentity(info, sessionId),
    ...(model !== undefined ? { model } : {}),
    ...buildCounters(info.tokens),
  };
}

/** Every counted message in a captured `opencode export --sanitize` payload, mapped onto the
 * stored record's own field names. A message whose `info.tokens` is absent — every user turn,
 * and any turn OpenCode never measured — yields no record: never an invented zero. `sessionId`
 * is trusted as given, matching every other local reader's contract; it is not re-derived
 * from `payload.info.id`. */
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
