import type { LocalCostCandidateRecord } from "../ports/session-cost-reader.js";

// Measured 2026-08-20 on opencode 1.14.20, providerID "anthropic": `opencode export
// <sessionID> --sanitize` answers `{info, messages}` on stdout, and a counted message's own
// `info` carries `tokens` (`{total, input, output, reasoning, cache:{read, write}}`),
// `modelID` and a stable `id`. `total == input + output + cache.read + cache.write` on every
// message captured that session (`reasoning` was `0` throughout, so it never entered the sum).
// `info.cost` is deliberately never read here: it is `0` in every message captured, its
// denomination (which currency, computed vs billed) has never been established, and a
// figure whose meaning is unknown is worse than an absent one.
// `info.providerID` (e.g. "anthropic", sitting right next to `modelID`) is deliberately
// never read either: the stored record has no provider field — `model` everywhere else in
// this codebase already holds a bare model id, not a `provider/model` pair — and inventing
// one here would introduce OpenCode's own vocabulary for something no other reader names.
//
// Re-probed 2026-08-24 against a second, genuinely different provider obtained on this
// machine — `opencode run --model opencode/big-pickle ...` (providerID "opencode", an
// `@ai-sdk/openai-compatible` backend). Its `total == input + output + cache.read +
// cache.write + reasoning` reconciled too (`14072 == 13926 + 13 + 128 + 0 + 5`), but that
// does not settle the question the way the "anthropic" capture does: a second, continued
// turn in the same session showed `cache.read: 0, cache.write: 0` throughout — this
// backend never exercised its cache — so no capture here ever put a large `cache.read`
// beside `input` for a non-Anthropic provider, which is the one comparison that would show
// `input` failing to shrink if it already counted the cached tokens. Anthropic's own
// exclusivity is independent of this reconciliation (it is the documented behaviour of its
// Messages API, corroborated elsewhere in this repo against Claude Code's own `/usage`) —
// so it alone is measured. Whether a provider that reports prompt tokens *inclusive* of
// cached ones (the way native OpenAI's Chat Completions usage does) would double-count
// through this same mapping remains open. See docs/telemetry-limits.md for the declaration
// this keeps beside the limit.
//
// That open question does not reopen the choice above to never read `info.providerID`: a
// per-record check would need a provider field on the stored record to hang a per-provider
// caveat off of, which is the schema change the comment above already declines, for a
// reason unrelated to this one. The declaration this limit needs instead is static — the
// same shape as Cursor's `not covered`, just narrower — and `opencode.ts`'s
// `telemetryLocalRead.limitation` carries it.
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

// `time.created`, not `time.completed`: created is on every counted message measured, while
// completed is absent on some, and a record that sometimes means "started" and sometimes
// means "finished" is worse than one that always means the same thing. Epoch milliseconds.
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

// A message OpenCode created but never billed carries `tokens` with every counter at `0`
// and no `total` key at all — reproduced on this machine 2026-08-24 by SIGINT-ing an
// `opencode run` mid-response and exporting the session: the interrupted assistant message
// has `time.created` but no `time.completed`, no `finish`, and a `tokens` object with no
// `total` — the same shape as this repo's own fixture's fourth assistant message.
// anomalyco/opencode#33687 confirms the mechanism: a message that halts on abort is not
// reliably given a `finish` either, so `total`'s absence is the signal, not something to
// wait on being fixed. A message that completed with genuinely zero usage still carries a
// `total` (`0`), and still yields a record: that is an observation, not a call that never
// happened.
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

/** Every billed message in a captured `opencode export --sanitize` payload, mapped onto the
 * stored record's own field names. A message whose `info.tokens` is absent — every user turn,
 * and any turn OpenCode never measured — yields no record: never an invented zero. Nor does one
 * whose `tokens` carries no `total`: that is a message OpenCode created but never billed (see
 * `wasBilled`), and counting it would inflate the request count with a call that never happened.
 * `sessionId` is trusted as given, matching every other local reader's contract; it is not
 * re-derived from `payload.info.id`. */
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
