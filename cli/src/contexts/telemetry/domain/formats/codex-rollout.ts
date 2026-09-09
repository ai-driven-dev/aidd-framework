import type {
  LocalCostCandidateRecord,
  TranscriptLineAccumulator,
} from "../ports/session-cost-reader.js";

// A `token_count` event carries a cumulative `total_token_usage` beside this call's own
// `last_token_usage`, so summing the totals double-counts every call after the first; it names
// no model and no request id, which live on the `turn_context` opening the turn. Its
// `input_tokens` is *inclusive* of `cached_input_tokens`, unlike Claude Code's exclusive figure,
// so cached is subtracted; `reasoning_output_tokens` is a subset of `output_tokens`, never added.
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
    readonly info?: {
      readonly last_token_usage?: CodexTokenUsage;
      readonly total_token_usage?: CodexTokenUsage;
    };
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

// `at` is the turn's own start, off the `turn_context` line rather than a counted event: a
// record covers a whole turn, so a moment inside it would claim a precision it does not have.
function startTurn(
  payload: NonNullable<CodexLine["payload"]>,
  at: string | undefined
): PendingTurn | null {
  const turnId = asString(payload.turn_id);
  if (turnId === undefined) return null;
  return { turnId, model: asString(payload.model), effort: asString(payload.effort), at };
}

/** The event's own increment, never the cumulative `total_token_usage`. A metric absent from
 * every event of the turn — Codex omits `cache_write_input_tokens` rather than sending zero —
 * stays unset rather than summed into a fabricated zero. */
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

/** Codex re-emits a turn's last `token_count` verbatim, the increment arriving twice while the
 * cumulative does not move — and a cumulative that has not moved cannot carry billed consumption.
 * `null` when the event states none: the increment is then counted, an absent figure being no
 * evidence that nothing happened. */
function cumulativeKey(usage: CodexTokenUsage | undefined): string | null {
  if (!usage) return null;
  const parts = [
    asNumber(usage.input_tokens),
    asNumber(usage.cached_input_tokens),
    asNumber(usage.cache_write_input_tokens),
    asNumber(usage.output_tokens),
  ];
  if (parts.every((part) => part === undefined)) return null;
  return parts.map((part) => (part === undefined ? "" : String(part))).join("/");
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

/** One record per turn, never per line. A turn is closed by the *next* `turn_context`, and a
 * rollout has no line saying the session is finished, so the final flush cannot tell an ended
 * session from a running one: it emits what the counters sum to so far, and whether a later
 * read's record for the same `turn_id` corrects it is decided downstream. */
class CodexRolloutAccumulator implements TranscriptLineAccumulator {
  private vendorId: string | undefined;
  private pending: PendingTurn | undefined;
  /** The cumulative last counted, so a re-emitted final `token_count` is not added twice. */
  private lastCumulative: string | undefined;
  private readonly records: LocalCostCandidateRecord[] = [];

  push(line: string): void {
    const parsed = parseLine(line);
    if (!parsed?.payload) return;
    if (parsed.type === "session_meta") this.vendorId = asString(parsed.payload.id);
    else if (parsed.type === "turn_context") this.startNewTurn(parsed.payload, parsed.timestamp);
    else if (parsed.type === "event_msg" && parsed.payload.type === "token_count") {
      this.applyTokenCount(
        parsed.payload.info?.last_token_usage,
        parsed.payload.info?.total_token_usage
      );
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

  private applyTokenCount(
    usage: CodexTokenUsage | undefined,
    cumulative: CodexTokenUsage | undefined
  ): void {
    if (!this.pending || !usage) return;
    const key = cumulativeKey(cumulative);
    if (key !== null && key === this.lastCumulative) return;
    if (key !== null) this.lastCumulative = key;
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

/** For a fixture-driven test to target directly: the adapter streams the accumulator one line
 * at a time, so a large rollout is never held whole in memory. */
export function mapCodexRolloutToSinkRecords(content: string): readonly LocalCostCandidateRecord[] {
  const accumulator = createCodexRolloutAccumulator();
  for (const line of content.split("\n")) accumulator.push(line);
  return accumulator.build();
}
