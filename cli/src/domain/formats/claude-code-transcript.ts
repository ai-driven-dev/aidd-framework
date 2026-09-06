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
  readonly uuid?: unknown;
  readonly parentUuid?: unknown;
  readonly promptId?: unknown;
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
    readonly content?: unknown;
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

/** One JSONL line as an object, or `null` for a blank or unparseable one. Shared by the
 * billed-turn parser and the link walk, so a line either reaches both or neither. */
function parseLine(line: string): ClaudeTranscriptLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as ClaudeTranscriptLine;
  } catch {
    return null;
  }
}

function uuidOf(line: string): string | undefined {
  const parsed = parseLine(line);
  return parsed === null ? undefined : asString(parsed.uuid);
}

/** The prompt a line belongs to, found by walking `parentUuid` upward.
 *
 * A billed call and the prompt that caused it never share a line: measured on a real
 * 810-record session, zero lines carry both `requestId` and `promptId`, only `type: "user"`
 * lines carry the second, and all 209 lines bearing counters reach one this way — three hops
 * in the median.
 *
 * `seen` bounds the walk instead of a hop count: a transcript is appended to by a live
 * process and can be truncated mid-write, so a parent that points at a line which never
 * arrived, or a cycle a damaged file leaves behind, must end the walk rather than search
 * forever. A hop cap would also terminate, but it would silently stop answering for a
 * legitimately deep chain, which is the kind of number nobody could ever justify. */
/** The skill a `Skill` tool call on this line invokes, or `undefined` for every other line.
 *
 * Only a `Skill` call names a step. Every other tool call is work done inside whatever step
 * was already running, and reading one as a start would name a skill for a prompt that
 * invoked none. `input.skill` is the field Claude Code puts the name in - the same one
 * `skill-detection.cjs` reads out of the hook payload, so the transcript and the run
 * journal name a step identically. */
function skillInvokedOn(line: ClaudeTranscriptLine): string | undefined {
  const content = line.message?.content;
  if (!Array.isArray(content)) return undefined;
  for (const part of content) {
    if (typeof part !== "object" || part === null) continue;
    const call = part as { type?: unknown; name?: unknown; input?: { skill?: unknown } };
    if (call.type !== "tool_use" || call.name !== "Skill") continue;
    const skill = asString(call.input?.skill);
    if (skill !== undefined) return skill;
  }
  return undefined;
}

function resolvePromptId(
  startUuid: string | undefined,
  parents: ReadonlyMap<string, string>,
  prompts: ReadonlyMap<string, string>
): string | undefined {
  const seen = new Set<string>();
  let current = startUuid;
  while (current !== undefined && !seen.has(current)) {
    const prompt = prompts.get(current);
    if (prompt !== undefined) return prompt;
    seen.add(current);
    current = parents.get(current);
  }
  return undefined;
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
  // Which line each record came from, so its prompt can be resolved once every line has
  // been seen — a parent almost always appears earlier, but nothing in the format promises
  // it, and a walk run mid-stream would answer from a half-built map.
  private readonly uuidByKey = new Map<string, string>();
  // Every line's own links, gathered from *all* lines rather than only billed ones: the
  // chain from a call to its prompt runs through lines that carry no counters at all.
  private readonly parents = new Map<string, string>();
  private readonly prompts = new Map<string, string>();
  /** Every `Skill` call the transcript holds, in the order it holds them, paired with the
   * line that made it. Resolved to prompts in `build()` and not here, for the reason the
   * class already resolves prompts there: a walk run mid-stream reads a half-built chain. */
  private readonly skillCalls: { readonly uuid: string; readonly skill: string }[] = [];

  push(line: string): void {
    this.rememberLinks(line);
    const parsed = parseAssistantLine(line);
    if (!parsed) return;
    this.byKey.set(parsed.dedupeKey, parsed.record);
    const uuid = uuidOf(line);
    if (uuid !== undefined) this.uuidByKey.set(parsed.dedupeKey, uuid);
  }

  /** Parsed a second time, deliberately: `parseAssistantLine` answers `null` for every line
   * that is not a billed assistant turn, and those are exactly the lines this walk needs. */
  private rememberLinks(line: string): void {
    const parsed = parseLine(line);
    if (parsed === null) return;
    const uuid = asString(parsed.uuid);
    if (uuid === undefined) return;
    const parent = asString(parsed.parentUuid);
    if (parent !== undefined) this.parents.set(uuid, parent);
    const prompt = asString(parsed.promptId);
    if (prompt !== undefined) this.prompts.set(uuid, prompt);
    const skill = skillInvokedOn(parsed);
    if (skill !== undefined) this.skillCalls.push({ uuid, skill });
  }

  /** The skill each prompt invoked, first call wins.
   *
   * The first and not the last: a prompt that invokes two skills invoked the second from
   * inside the first, and the prompt is named for the work it began - the same rule
   * `promptToSkill` follows over the run journal's own `step_start` lines, so the two
   * sources cannot disagree about a prompt they both saw. */
  private skillByPrompt(): ReadonlyMap<string, string> {
    const byPrompt = new Map<string, string>();
    for (const { uuid, skill } of this.skillCalls) {
      const prompt = resolvePromptId(uuid, this.parents, this.prompts);
      if (prompt !== undefined && !byPrompt.has(prompt)) byPrompt.set(prompt, skill);
    }
    return byPrompt;
  }

  build(): readonly LocalCostCandidateRecord[] {
    const skillByPrompt = this.skillByPrompt();
    return [...this.byKey.entries()].map(([key, record]) => {
      const promptId = resolvePromptId(this.uuidByKey.get(key), this.parents, this.prompts);
      if (promptId === undefined) return record;
      const promptSkill = skillByPrompt.get(promptId);
      return {
        ...record,
        prompt_id: promptId,
        ...(promptSkill === undefined ? {} : { prompt_skill: promptSkill }),
      };
    });
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
