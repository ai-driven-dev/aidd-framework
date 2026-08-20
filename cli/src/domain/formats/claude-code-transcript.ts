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
): Pick<LocalCostCandidateRecord, "vendor_id" | "vendor_field" | "turn_id" | "turn_field"> {
  const turnId = asString(line.requestId);
  return {
    vendor_id: vendorId,
    vendor_field: VENDOR_FIELD,
    ...(turnId !== undefined ? { turn_id: turnId, turn_field: TURN_FIELD } : {}),
  };
}

// The export path sets `agent_name` for a subagent's own request (see
// otlp-logs-claude-code-subagent.json); matching that here is what keeps a consumer from
// being able to tell a local-read subagent record from an exported one by anything but
// `provenance`.
function buildOptionalFields(
  line: ClaudeTranscriptLine
): Pick<LocalCostCandidateRecord, "model" | "effort" | "event_timestamp" | "agent_name"> {
  const model = asString(line.message?.model);
  const effort = asString(line.effort);
  const timestamp = asString(line.timestamp);
  const agentName = line.isSidechain === true ? asString(line.attributionAgent) : undefined;
  return {
    ...(model !== undefined ? { model } : {}),
    ...(effort !== undefined ? { effort } : {}),
    ...(timestamp !== undefined ? { event_timestamp: timestamp } : {}),
    ...(agentName !== undefined ? { agent_name: agentName } : {}),
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
 * separate log lines one API call can produce. A real capture showed one assistant call
 * logged as two lines (a `thinking` content block, then a `tool_use` block) sharing one
 * `message.id` and one `requestId`, each carrying the same `usage`. Mapping every such line
 * to its own record would count that single call's tokens twice. */
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
  const vendorId = asString(parsed.sessionId);
  if (vendorId === undefined) return null;
  const counters = readCounters(parsed.message?.usage);
  if (!counters) return null;
  const dedupeKey = asString(parsed.message?.id) ?? asString(parsed.requestId) ?? trimmed;
  return { dedupeKey, record: buildRecord(parsed, vendorId, counters) };
}

class ClaudeCodeTranscriptAccumulator implements TranscriptLineAccumulator {
  private readonly seen = new Set<string>();
  private readonly records: LocalCostCandidateRecord[] = [];

  push(line: string): void {
    const parsed = parseAssistantLine(line);
    if (!parsed || this.seen.has(parsed.dedupeKey)) return;
    this.seen.add(parsed.dedupeKey);
    this.records.push(parsed.record);
  }

  build(): readonly LocalCostCandidateRecord[] {
    return this.records;
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
