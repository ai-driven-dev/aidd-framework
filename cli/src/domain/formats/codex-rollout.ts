import { sep } from "node:path";
import type { TranscriptLocation } from "../capabilities/telemetry-capability.js";
import type {
  LocalCostCandidateRecord,
  TranscriptLineAccumulator,
} from "../ports/session-cost-reader.js";

// Measured 2026-08-20 against two real rollouts on Codex CLI 0.145.0-alpha.27:
// ~/.codex/sessions/2026/07/29/rollout-*-019fae6f-....jsonl (a resumed session, where
// `session_meta.id` and `session_id` differ) and .../2026/07/16/rollout-*-019f69d0-....jsonl
// (that resumed session's own parent, a fresh session where the two agree). If Codex moves
// any of these field names, tests/domain/formats/codex-rollout.unit.test.ts turns red
// against the captured fixtures before a zero could be stored in the moved field's place.
//
// A `token_count` event's `info` carries `total_token_usage` (cumulative for the whole
// rollout) and `last_token_usage` (this call's own increment) — summing the totals across
// calls double-counts every call after the first. `info` carries no model and no request
// id at all; those live on the `turn_context` event that precedes the run of `token_count`
// events belonging to one turn, keyed by `turn_id`. And `last_token_usage.input_tokens` is
// *inclusive* of `cached_input_tokens` (OpenAI's Responses API convention), unlike Claude
// Code's `usage.input_tokens`, which is exclusive of its own cache figure — subtracting
// `cached_input_tokens` here is what keeps `input_tokens` meaning the same thing across
// tools. `reasoning_output_tokens` is a subset of `output_tokens`, not a sibling of it, so
// it is never added to it.
const VENDOR_FIELD = "session_meta.id";
const TURN_FIELD = "turn_id";

interface CodexTokenUsage {
  readonly input_tokens?: unknown;
  readonly cached_input_tokens?: unknown;
  readonly cache_write_input_tokens?: unknown;
  readonly output_tokens?: unknown;
}

interface CodexLine {
  readonly type?: unknown;
  readonly timestamp?: unknown;
  readonly payload?: {
    readonly id?: unknown;
    readonly turn_id?: unknown;
    readonly model?: unknown;
    readonly effort?: unknown;
    readonly type?: unknown;
    readonly info?: { readonly last_token_usage?: CodexTokenUsage };
  };
}

interface PendingTurn {
  readonly turnId: string;
  readonly model?: string;
  readonly effort?: string;
  readonly at?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseLine(line: string): CodexLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as CodexLine;
  } catch {
    return null;
  }
}

// `at` is the turn's own start, taken from the `turn_context` line rather than from any
// counted event: a record here covers a whole turn, so a moment inside it would claim a
// precision the record does not have. It is what a step interval is matched against.
function startTurn(
  payload: NonNullable<CodexLine["payload"]>,
  at: string | undefined
): PendingTurn | null {
  const turnId = asString(payload.turn_id);
  if (turnId === undefined) return null;
  return { turnId, model: asString(payload.model), effort: asString(payload.effort), at };
}

/** Adds this event's own increment to the turn's running sums — never the cumulative
 * `total_token_usage`. A metric absent from every event in the turn (Codex sometimes omits
 * `cache_write_input_tokens` entirely rather than sending zero) stays unset rather than
 * being summed into a fabricated zero. */
function addUsage(pending: PendingTurn, usage: CodexTokenUsage): void {
  const rawInput = asNumber(usage.input_tokens);
  const cached = asNumber(usage.cached_input_tokens);
  const cacheWrite = asNumber(usage.cache_write_input_tokens);
  const output = asNumber(usage.output_tokens);
  if (rawInput !== undefined) {
    pending.inputTokens = (pending.inputTokens ?? 0) + (rawInput - (cached ?? 0));
  }
  if (cached !== undefined) pending.cacheReadTokens = (pending.cacheReadTokens ?? 0) + cached;
  if (cacheWrite !== undefined) {
    pending.cacheCreationTokens = (pending.cacheCreationTokens ?? 0) + cacheWrite;
  }
  if (output !== undefined) pending.outputTokens = (pending.outputTokens ?? 0) + output;
}

function hasCounters(pending: PendingTurn): boolean {
  return (
    pending.inputTokens !== undefined ||
    pending.outputTokens !== undefined ||
    pending.cacheReadTokens !== undefined ||
    pending.cacheCreationTokens !== undefined
  );
}

function buildRecord(vendorId: string, pending: PendingTurn): LocalCostCandidateRecord {
  return {
    kind: "request",
    vendor_id: vendorId,
    vendor_field: VENDOR_FIELD,
    turn_id: pending.turnId,
    turn_field: TURN_FIELD,
    ...(pending.model !== undefined ? { model: pending.model } : {}),
    ...(pending.effort !== undefined ? { effort: pending.effort } : {}),
    ...(pending.at !== undefined ? { event_timestamp: pending.at } : {}),
    ...(pending.inputTokens !== undefined ? { input_tokens: pending.inputTokens } : {}),
    ...(pending.outputTokens !== undefined ? { output_tokens: pending.outputTokens } : {}),
    ...(pending.cacheReadTokens !== undefined
      ? { cache_read_tokens: pending.cacheReadTokens }
      : {}),
    ...(pending.cacheCreationTokens !== undefined
      ? { cache_creation_tokens: pending.cacheCreationTokens }
      : {}),
  };
}

/** Pairs each `turn_context` with the `token_count` events that follow it, up to the next
 * `turn_context` (or end of file), and emits one record per turn — never per line, since a
 * `token_count` event alone carries no model, no request id, and only a cumulative figure. */
class CodexRolloutAccumulator implements TranscriptLineAccumulator {
  private vendorId: string | undefined;
  private pending: PendingTurn | undefined;
  private readonly records: LocalCostCandidateRecord[] = [];

  push(line: string): void {
    const parsed = parseLine(line);
    if (!parsed?.payload) return;
    if (parsed.type === "session_meta") this.vendorId = asString(parsed.payload.id);
    else if (parsed.type === "turn_context") this.startNewTurn(parsed.payload, parsed.timestamp);
    else if (parsed.type === "event_msg" && parsed.payload.type === "token_count") {
      this.applyTokenCount(parsed.payload.info?.last_token_usage);
    }
  }

  build(): readonly LocalCostCandidateRecord[] {
    this.flush();
    return this.records;
  }

  private startNewTurn(payload: NonNullable<CodexLine["payload"]>, timestamp: unknown): void {
    this.flush();
    this.pending = startTurn(payload, asString(timestamp)) ?? undefined;
  }

  private applyTokenCount(usage: CodexTokenUsage | undefined): void {
    if (!this.pending || !usage) return;
    addUsage(this.pending, usage);
  }

  private flush(): void {
    if (this.pending && this.vendorId !== undefined && hasCounters(this.pending)) {
      this.records.push(buildRecord(this.vendorId, this.pending));
    }
    this.pending = undefined;
  }
}

export function createCodexRolloutAccumulator(): TranscriptLineAccumulator {
  return new CodexRolloutAccumulator();
}

/** The `(content: string) => records[]` shape task 1.4 asks for, and what a fixture-driven
 * test targets directly. The adapter instead streams `createCodexRolloutAccumulator` one
 * line at a time, so a large rollout is never held whole in memory. */
export function mapCodexRolloutToSinkRecords(content: string): readonly LocalCostCandidateRecord[] {
  const accumulator = createCodexRolloutAccumulator();
  for (const line of content.split("\n")) accumulator.push(line);
  return accumulator.build();
}

/**
 * Resolving Codex's session by `session_meta.id`, not `session_meta.session_id`, is
 * task 3's whole point: on a fresh session the two hold the same value, so a reader keyed
 * on the wrong one still passes every test written against a fresh session. This location's
 * `matches` relies on the filename instead of opening the file to check — measured across
 * every rollout on disk, a file's own trailing UUID always equals its `session_meta.id`,
 * including on the resumed session captured above, where it does not equal `session_id`.
 */
export const CODEX_ROLLOUT_LOCATION: TranscriptLocation = {
  root: (homeDir) => `${homeDir}${sep}.codex${sep}sessions`,
  matches: (relativePath, sessionId) => {
    const base = relativePath.split(sep).pop() ?? relativePath;
    return base.startsWith("rollout-") && base.endsWith(`-${sessionId}.jsonl`);
  },
};
