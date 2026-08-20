import {
  SINK_SCHEMA_VERSION,
  type TelemetrySinkRecord,
} from "../../../domain/models/telemetry-sink-record.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../domain/models/tool-ids.js";
import type {
  LocalCostCandidateRecord,
  SessionCostReader,
} from "../../../domain/ports/session-cost-reader.js";
import type { TelemetrySink } from "../../../domain/ports/telemetry-sink.js";
import { getAiToolConfig } from "../../../domain/tools/registry.js";

export type LocalCostToolStatus = "found" | "empty" | "not-covered";

export interface LocalCostToolReport {
  readonly tool: AiToolId;
  readonly status: LocalCostToolStatus;
  /** Records the reader returned, before dedup — this is what makes "found" and "empty"
   * distinguishable from each other, independent of how many were new. */
  readonly recordsFound: number;
  /** Records newly appended to the sink; a re-read of an already-stored session can be
   * `status: "found"` with `recordsStored: 0`. */
  readonly recordsStored: number;
  /** Why this tool is not covered, or — for a covered one — what its figures cannot yet be
   * used for. Both come from the declaration; an `unmeasured` tool has neither by design. */
  readonly reason?: string;
}

export interface ReadLocalCostOptions {
  readonly sessionId: string;
  readonly at?: Date;
}

export interface ReadLocalCostResult {
  readonly toolReports: readonly LocalCostToolReport[];
}

/** Reads what every locally-readable tool's own files hold for one session, normalises it
 * into the stored shape, and appends what is not already there. Which tools are readable
 * is a declaration in `domain/tools/ai/*.ts`, read through the registry — this class names
 * no tool. Which adapter serves a declared tool is decided once, at the composition root,
 * and handed in as `readers`. */
export class ReadLocalCostUseCase {
  constructor(
    private readonly sink: TelemetrySink,
    private readonly readers: ReadonlyMap<AiToolId, SessionCostReader>
  ) {}

  async execute(options: ReadLocalCostOptions): Promise<ReadLocalCostResult> {
    const at = options.at ?? new Date();
    const toolReports: LocalCostToolReport[] = [];
    for (const tool of AI_TOOL_IDS) {
      toolReports.push(await this.readOneTool(tool, options.sessionId, at));
    }
    return { toolReports };
  }

  private async readOneTool(
    tool: AiToolId,
    sessionId: string,
    at: Date
  ): Promise<LocalCostToolReport> {
    const localRead = getAiToolConfig(tool).telemetryLocalRead;
    if (localRead.kind !== "declared") {
      const reason = localRead.kind === "unsupported" ? localRead.reason : undefined;
      return { tool, status: "not-covered", recordsFound: 0, recordsStored: 0, reason };
    }
    const candidates = (await this.readers.get(tool)?.read(sessionId)) ?? [];
    const recordsStored = await this.storeNewCandidates(sessionId, candidates, at);
    return {
      tool,
      status: candidates.length === 0 ? "empty" : "found",
      recordsFound: candidates.length,
      recordsStored,
      ...(localRead.limitation !== undefined ? { reason: localRead.limitation } : {}),
    };
  }

  /** Matches each candidate against what the sink already holds for this session, on
   * `turn_id` alone — never a hash of the line, since the tool's own file keeps growing
   * as the same record is read again. A candidate with no `turn_id` cannot be matched and
   * is always appended: the reader's contract forbids inventing a key for it. */
  private async storeNewCandidates(
    sessionId: string,
    candidates: readonly LocalCostCandidateRecord[],
    at: Date
  ): Promise<number> {
    if (candidates.length === 0) return 0;
    const existing = await this.sink.readRecordsForVendor(sessionId);
    const storedTurnIds = new Set(
      existing.map((record) => record.turn_id).filter((id): id is string => id !== undefined)
    );
    let stored = 0;
    for (const candidate of candidates) {
      if (candidate.turn_id !== undefined && storedTurnIds.has(candidate.turn_id)) continue;
      await this.sink.appendRecord(this.stampProvenance(candidate), at);
      stored++;
    }
    return stored;
  }

  private stampProvenance(candidate: LocalCostCandidateRecord): TelemetrySinkRecord {
    return { ...candidate, sink_schema_version: SINK_SCHEMA_VERSION, provenance: "local-read" };
  }
}
