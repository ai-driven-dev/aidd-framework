import type {
  LocalCostCandidateRecord,
  TranscriptLineAccumulator,
} from "../ports/session-cost-reader.js";

// Field names measured against real transcripts: the unit test turns red against its fixture if
// Claude Code moves one, before a zero could be stored in the moved field's place. A subagent's
// messages are never inline in the main transcript but in their own `subagents/agent-*.jsonl`,
// which is why `CLAUDE_CODE_TRANSCRIPT_LOCATION` matches both layouts.
const VENDOR_FIELD = "sessionId";
const TURN_FIELD = "requestId";

// Claude Code writes its own fabricated assistant messages with this literal in
// `message.model` — a session-limit or error notice the tool composed, billed to nobody, so
// they yield no record. The marker is the filter, never all-counters-zero: a genuinely billed
// call reading zero on every counter is still an observation, and still yields its record.
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

/** All four or none: a partial `usage` yields no record rather than one whose missing counter
 * reads as zero. */
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
    // Stated separately rather than derived from `turn_id` downstream: `turn_id` is not unique
    // per billed request on every route, and a consumer collapsing two records into one must
    // never key on a field carrying that caveat.
    ...(turnId !== undefined ? { billed_request_id: turnId } : {}),
  };
}

// `agent_name` matches what the export path sets, so a local-read subagent record differs from
// an exported one by `provenance` alone. `attributionSkill` is omitted, never nulled, both when
// no skill runs and on a version predating it, so its absence yields no `step` at all rather
// than asserting "no skill ran"; `attributionPlugin` is read only alongside it.
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

/** Only a `Skill` call names a step: every other tool call is work done inside the step already
 * running, and reading one as a start would name a skill for a prompt that invoked none.
 * `input.skill` is the same field `skill-detection.cjs` reads out of the hook payload, so
 * transcript and run journal name a step identically. */
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

/** The prompt a line belongs to, walking `parentUuid` upward — a billed call and the prompt
 * that caused it never share a line. `seen` bounds the walk rather than a hop count: a live
 * transcript truncated mid-write can point at a parent that never arrived, or leave a cycle,
 * while a hop cap would silently stop answering for a legitimately deep chain. */
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

/** Keyed by `message.id`: Claude Code writes a line when a message starts and another when it
 * completes, so one record per line would count the same call twice. The last wins, carrying the
 * complete `output_tokens` where the first holds a placeholder; the figures are never summed,
 * the lines being one call restated with identical input and cache-read counters. */
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
  // Insertion-ordered, value replaced rather than skipped: the record keeps the position the
  // call first appeared at, so a reader sees the order the calls happened.
  private readonly byKey = new Map<string, LocalCostCandidateRecord>();
  // Which line each record came from, so prompts are resolved once every line has been seen:
  // nothing in the format promises a parent appears earlier, and a walk run mid-stream would
  // answer from a half-built map.
  private readonly uuidByKey = new Map<string, string>();
  // Gathered from *all* lines, not only billed ones: the chain from a call to its prompt runs
  // through lines carrying no counters at all.
  private readonly parents = new Map<string, string>();
  private readonly prompts = new Map<string, string>();
  /** In the order the transcript holds them, resolved to prompts in `build()` for the same
   * reason prompts are: a walk run mid-stream reads a half-built chain. */
  private readonly skillCalls: { readonly uuid: string; readonly skill: string }[] = [];

  push(line: string): void {
    this.rememberLinks(line);
    const parsed = parseAssistantLine(line);
    if (!parsed) return;
    this.byKey.set(parsed.dedupeKey, parsed.record);
    const uuid = uuidOf(line);
    if (uuid !== undefined) this.uuidByKey.set(parsed.dedupeKey, uuid);
  }

  /** Parsed a second time: `parseAssistantLine` answers `null` for every line that is not a
   * billed assistant turn, and those are exactly the lines this walk needs. */
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

  /** First call wins, not the last: a prompt invoking two skills invoked the second from
   * inside the first, and the prompt is named for the work it began — the same rule
   * `promptToSkill` follows over the journal's own lines, so the two cannot disagree. */
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

/** A wrapper around the same per-line logic, for a fixture-driven test to target directly:
 * the adapter streams the accumulator instead, so a large transcript is never held whole. */
export function mapClaudeCodeTranscriptToSinkRecords(
  content: string
): readonly LocalCostCandidateRecord[] {
  const accumulator = createClaudeCodeTranscriptAccumulator();
  for (const line of content.split("\n")) accumulator.push(line);
  return accumulator.build();
}
