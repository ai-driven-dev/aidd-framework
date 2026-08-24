import { sep } from "node:path";
import type { TranscriptLocation } from "../capabilities/telemetry-capability.js";
import type {
  LocalCostCandidateRecord,
  TranscriptLineAccumulator,
} from "../ports/session-cost-reader.js";

// Measured 2026-08-20 against two real files: a main transcript line from
// ~/.claude/projects/*/*.jsonl (Claude Code 2.1.229) and a subagent's own line from
// ~/.claude/projects/*/<sessionId>/subagents/agent-*.jsonl (2.1.232). If Claude Code moves
// any of these field names, tests/domain/formats/claude-code-transcript.unit.test.ts turns
// red against the captured fixture before a zero could be stored in the moved field's place.
//
// A subagent's own messages are never inline in the main transcript — every `isSidechain:
// true` line measured lives only in its own `<sessionId>/subagents/agent-*.jsonl` file,
// which is why the adapter's `TranscriptLocation` below matches both layouts.
const VENDOR_FIELD = "sessionId";
const TURN_FIELD = "requestId";

// Claude Code writes its own fabricated assistant messages into the transcript with this
// literal in `message.model` - a session-limit notice, an "API Error: your computer went
// to sleep" notice. They are messages the tool composed, not calls anyone was
// billed for, so they yield no record at all.
//
// The filter is the marker, never all-counters-zero: measured 2026-08-23 across every
// transcript in ~/.claude/projects, all 251 `<synthetic>` messages carried four zero
// counters and `<synthetic>` was the only such placeholder any of them used for a model.
// A genuinely billed call that happened to read zero on all four - improbable, not
// impossible - is still an observation, and still yields its record.
const SYNTHETIC_MODEL = "<synthetic>";

interface ClaudeUsage {
  readonly input_tokens?: unknown;
  readonly cache_creation_input_tokens?: unknown;
  readonly cache_read_input_tokens?: unknown;
  readonly output_tokens?: unknown;
}

interface ClaudeTranscriptLine {
  readonly type?: unknown;
  readonly sessionId?: unknown;
  readonly requestId?: unknown;
  readonly isSidechain?: unknown;
  readonly timestamp?: unknown;
  readonly effort?: unknown;
  readonly attributionAgent?: unknown;
  readonly attributionSkill?: unknown;
  readonly attributionPlugin?: unknown;
  readonly message?: {
    readonly model?: unknown;
    readonly id?: unknown;
    readonly usage?: ClaudeUsage;
  };
}

interface ClaudeCounters {
  readonly input_tokens: number;
  readonly cache_creation_input_tokens: number;
  readonly cache_read_input_tokens: number;
  readonly output_tokens: number;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** All four or none: a partial `usage` — a truncated final line, or a shape this file has
 * not been taught — yields no record rather than one with a missing counter read as zero. */
function readCounters(usage: ClaudeUsage | undefined): ClaudeCounters | null {
  const input = asNumber(usage?.input_tokens);
  const cacheCreation = asNumber(usage?.cache_creation_input_tokens);
  const cacheRead = asNumber(usage?.cache_read_input_tokens);
  const output = asNumber(usage?.output_tokens);
  if (input === undefined || cacheCreation === undefined) return null;
  if (cacheRead === undefined || output === undefined) return null;
  return {
    input_tokens: input,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
    output_tokens: output,
  };
}

function buildIdentity(
  line: ClaudeTranscriptLine,
  vendorId: string
): Pick<
  LocalCostCandidateRecord,
  "vendor_id" | "vendor_field" | "turn_id" | "turn_field" | "billed_request_id"
> {
  const turnId = asString(line.requestId);
  return {
    vendor_id: vendorId,
    vendor_field: VENDOR_FIELD,
    ...(turnId !== undefined ? { turn_id: turnId, turn_field: TURN_FIELD } : {}),
    // The same value as `turn_id` on this route — Claude Code's local transcript names one
    // billed call the same way it names one turn, `requestId`. Stated separately rather
    // than derived from `turn_id` downstream: `turn_id` is not guaranteed unique per billed
    // request on every tool and route, and a consumer collapsing two records into one must
    // never key that on a field with that caveat. See telemetry-sink-record.ts.
    ...(turnId !== undefined ? { billed_request_id: turnId } : {}),
  };
}

// The export path sets `agent_name` for a subagent's own request (see
// otlp-logs-claude-code-subagent.json); matching that here is what keeps a consumer from
// being able to tell a local-read subagent record from an exported one by anything but
// `provenance`.
// `attributionSkill` is exact and unflagged, per message, on the same line as `usage` —
// measured 2026-08-20 against 40 real transcripts (2267 attributed messages, 25 distinct
// skills). It arrived around Claude Code 2.1.220 and is omitted, never nulled, when no
// skill is running; a version that predates the field omits it identically. Nothing on the
// line separates those two cases, so its absence here yields no `step` at all, leaving
// attribution to fall back to a run-journal interval (or unattributed) rather than
// asserting "no skill ran". `attributionPlugin` is read alongside it, and only alongside
// it — a plugin name with no skill name is not a fact this line can state.
function buildOptionalFields(
  line: ClaudeTranscriptLine
): Pick<
  LocalCostCandidateRecord,
  "model" | "effort" | "event_timestamp" | "agent_name" | "step" | "step_plugin"
> {
  const model = asString(line.message?.model);
  const effort = asString(line.effort);
  const timestamp = asString(line.timestamp);
  const agentName = line.isSidechain === true ? asString(line.attributionAgent) : undefined;
  const step = asString(line.attributionSkill);
  const stepPlugin = step !== undefined ? asString(line.attributionPlugin) : undefined;
  return {
    ...(model !== undefined ? { model } : {}),
    ...(effort !== undefined ? { effort } : {}),
    ...(timestamp !== undefined ? { event_timestamp: timestamp } : {}),
    ...(agentName !== undefined ? { agent_name: agentName } : {}),
    ...(step !== undefined ? { step } : {}),
    ...(stepPlugin !== undefined ? { step_plugin: stepPlugin } : {}),
  };
}

function buildRecord(
  line: ClaudeTranscriptLine,
  vendorId: string,
  counters: ClaudeCounters
): LocalCostCandidateRecord {
  return {
    kind: "request",
    ...buildIdentity(line, vendorId),
    ...buildOptionalFields(line),
    input_tokens: counters.input_tokens,
    output_tokens: counters.output_tokens,
    cache_read_tokens: counters.cache_read_input_tokens,
    cache_creation_tokens: counters.cache_creation_input_tokens,
  };
}

/** One parsed JSONL line, keyed by `message.id` — the identifier that ties together the
 * separate log lines one API call can produce. Mapping every such line to its own record
 * would count that single call's tokens more than once.
 *
 * The lines do NOT all carry the same `usage`, which an earlier version of this comment
 * claimed. Measured across 1,604 real transcripts on one machine: of 83,626 `message.id`
 * groups, 25,702 carry differing figures, and in 25,702 of 25,702 the last line's
 * `output_tokens` is greater than or equal to the first's. Claude Code writes a line when a
 * message starts and again when it completes, and only the last carries
 * `output_tokens_details` and `iterations`. Keeping the first kept the placeholder: 37.4% of
 * every output token on that machine was being discarded, and up to 94% of a
 * subagent-heavy session's.
 *
 * The last line wins, and the figures are never summed. In 25,143 of those 25,702 groups
 * `input_tokens` and `cache_read_input_tokens` are identical across the lines — they are one
 * call restated, not two calls — so adding them would multiply the cache counters, which are
 * by far the largest. */
function parseAssistantLine(
  line: string
): { readonly dedupeKey: string; readonly record: LocalCostCandidateRecord } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: ClaudeTranscriptLine;
  try {
    parsed = JSON.parse(trimmed) as ClaudeTranscriptLine;
  } catch {
    return null;
  }
  if (parsed.type !== "assistant") return null;
  // Before the dedupe key is computed: a line that is not a request must not consume a
  // key either, or the first real call sharing it would be dropped as a duplicate.
  if (parsed.message?.model === SYNTHETIC_MODEL) return null;
  const vendorId = asString(parsed.sessionId);
  if (vendorId === undefined) return null;
  const counters = readCounters(parsed.message?.usage);
  if (!counters) return null;
  const dedupeKey = asString(parsed.message?.id) ?? asString(parsed.requestId) ?? trimmed;
  return { dedupeKey, record: buildRecord(parsed, vendorId, counters) };
}

class ClaudeCodeTranscriptAccumulator implements TranscriptLineAccumulator {
  // Insertion-ordered, and the value is replaced rather than skipped: a later line for a key
  // already seen is the same call, restated with figures that have grown. The record's
  // position stays where the call first appeared, so the order a reader sees is the order
  // the calls happened.
  private readonly byKey = new Map<string, LocalCostCandidateRecord>();

  push(line: string): void {
    const parsed = parseAssistantLine(line);
    if (!parsed) return;
    this.byKey.set(parsed.dedupeKey, parsed.record);
  }

  build(): readonly LocalCostCandidateRecord[] {
    return [...this.byKey.values()];
  }
}

export function createClaudeCodeTranscriptAccumulator(): TranscriptLineAccumulator {
  return new ClaudeCodeTranscriptAccumulator();
}

/** The `(content: string) => records[]` shape task 1.4 asks for, and what a fixture-driven
 * test targets directly. The adapter instead streams `createClaudeCodeTranscriptAccumulator`
 * one line at a time, so a large transcript is never held whole in memory — this is a
 * convenience wrapper around the same per-line logic, not a second implementation of it. */
export function mapClaudeCodeTranscriptToSinkRecords(
  content: string
): readonly LocalCostCandidateRecord[] {
  const accumulator = createClaudeCodeTranscriptAccumulator();
  for (const line of content.split("\n")) accumulator.push(line);
  return accumulator.build();
}

function matchesMainTranscript(segments: readonly string[], sessionId: string): boolean {
  return segments.length === 2 && segments[1] === `${sessionId}.jsonl`;
}

function matchesSubagentTranscript(segments: readonly string[], sessionId: string): boolean {
  return (
    segments.length === 4 &&
    segments[1] === sessionId &&
    segments[2] === "subagents" &&
    segments[3].endsWith(".jsonl")
  );
}

export const CLAUDE_CODE_TRANSCRIPT_LOCATION: TranscriptLocation = {
  root: (homeDir) => `${homeDir}${sep}.claude${sep}projects`,
  matches: (relativePath, sessionId) => {
    const segments = relativePath.split(sep);
    return (
      matchesMainTranscript(segments, sessionId) || matchesSubagentTranscript(segments, sessionId)
    );
  },
};
