import type { TelemetryLocalRead } from "../../../domain/capabilities/telemetry-capability.js";
import {
  resolveSessionProject,
  type SessionProject,
} from "../../../domain/models/session-project.js";
import {
  attributeMoment,
  buildStepIntervals,
  type StepInterval,
} from "../../../domain/models/step-attribution.js";
import {
  SINK_SCHEMA_VERSION,
  type TelemetrySinkRecord,
} from "../../../domain/models/telemetry-sink-record.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../domain/models/tool-ids.js";
import type { RunJournalReader } from "../../../domain/ports/run-journal-reader.js";
import type {
  LocalCostCandidateRecord,
  LocalCostReadResult,
  SessionCostReader,
} from "../../../domain/ports/session-cost-reader.js";
import type { TelemetrySink } from "../../../domain/ports/telemetry-sink.js";
import { getAiToolConfig } from "../../../domain/tools/registry.js";

/** Five answers, and only one of them may ever be printed as a zero.
 *
 * - `found` — this tool held the session and billed for it.
 * - `empty` — it held the session and billed nothing. The zero is the measurement.
 * - `not-found` — it has no trace of the session at all. Nothing is known about it.
 * - `unreadable` — its reader failed. Nothing is known about it, and something is wrong.
 * - `not-covered` — nothing here can read this tool, and its declaration says why.
 *
 * The last four look alike in a total and mean four different things. Collapsing any of
 * them into `empty` is exactly how a session that was never measured reads as free. */
export type LocalCostToolStatus = "found" | "empty" | "not-found" | "unreadable" | "not-covered";

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
   * used for; both come from the declaration. On `unreadable` it is what the reader itself
   * said, since only the reader knows why it could not answer. */
  readonly reason?: string;
  /** Sessions this tool's reader threw on. Carried separately from `status` because a
   * sweep can read nineteen sessions and fail the twentieth: the figures are real, so the
   * status is `found`, and a failure that only showed up in the status would vanish
   * exactly when there is most to lose. Zero on a single-session read that succeeded. */
  readonly sessionsFailed: number;
  /** What the last failed session's reader said, when any failed. */
  readonly failureReason?: string;
}

export interface ReadLocalCostOptions {
  /** One session by name. Absent reads every session the run journal knows about — the
   * only route a person has, since nothing tells them a session identifier. */
  readonly sessionId?: string;
  readonly at?: Date;
}

/** What one session's read produced. `sessionId` is on the report because a sweep answers
 * about several and a caller has to be able to tell them apart. */
export interface LocalCostSessionReport {
  readonly sessionId: string;
  readonly toolReports: readonly LocalCostToolReport[];
}

export interface ReadLocalCostResult {
  readonly sessions: readonly LocalCostSessionReport[];
  /** Every tool's answer across every session read, so a caller sees one line per tool
   * rather than one per tool per session. */
  readonly toolReports: readonly LocalCostToolReport[];
}

/** Reads what every locally-readable tool's own files hold for one session, normalises it
 * into the stored shape, and appends what is not already there. Which tools are readable
 * is a declaration in `domain/tools/ai/*.ts`, read through the registry — this class names
 * no tool. Which adapter serves a declared tool is decided once, at the composition root,
 * and handed in as `readers`. */
function isPresent(value: string | undefined): value is string {
  return value !== undefined;
}

/** The strongest answer a tool gave anywhere in the sweep.
 *
 * A tool that read one session and could not read another reports as `found`: the figures
 * it produced are real, and calling the whole tool broken would discard them. The failure
 * does not disappear with the status — `sessionsFailed` counts it separately, precisely so
 * that a status which is honest about the figures cannot also be a silence about the
 * failures. `unreadable` outranks the two silences for the mirror reason. */
const STATUS_RANK: readonly LocalCostToolStatus[] = [
  "found",
  "unreadable",
  "empty",
  "not-found",
  "not-covered",
];

function strongestOf(tool: AiToolId, reports: readonly LocalCostToolReport[]): LocalCostToolReport {
  const nothingKnown: LocalCostToolReport = {
    tool,
    status: "not-found",
    recordsFound: 0,
    recordsStored: 0,
    sessionsFailed: 0,
  };
  return reports.reduce(
    (strongest, report) =>
      STATUS_RANK.indexOf(report.status) < STATUS_RANK.indexOf(strongest.status)
        ? report
        : strongest,
    reports[0] ?? nothingKnown
  );
}

function mergeOneTool(
  tool: AiToolId,
  sessions: readonly LocalCostSessionReport[]
): LocalCostToolReport {
  const reports = sessions.flatMap((session) =>
    session.toolReports.filter((report) => report.tool === tool)
  );
  const failures = reports
    .map((report) => report.failureReason)
    .filter((reason): reason is string => reason !== undefined);
  return {
    ...strongestOf(tool, reports),
    recordsFound: reports.reduce((sum, report) => sum + report.recordsFound, 0),
    recordsStored: reports.reduce((sum, report) => sum + report.recordsStored, 0),
    sessionsFailed: failures.length,
    ...(failures.length === 0 ? {} : { failureReason: failures[failures.length - 1] }),
  };
}

/** Nothing here can read this tool at all, with the reason its declaration gives. */
function notCovered(tool: AiToolId, localRead: TelemetryLocalRead): LocalCostToolReport {
  return {
    tool,
    status: "not-covered",
    recordsFound: 0,
    recordsStored: 0,
    sessionsFailed: 0,
    ...(localRead.kind === "unsupported" ? { reason: localRead.reason } : {}),
  };
}

/** Its reader failed, so nothing is known about it and something is wrong — distinct from
 * `not-found`, where nothing is known and nothing is wrong. */
function unreadable(tool: AiToolId, failure: string): LocalCostToolReport {
  return {
    tool,
    status: "unreadable",
    recordsFound: 0,
    recordsStored: 0,
    sessionsFailed: 1,
    reason: failure,
    failureReason: failure,
  };
}

function mergeToolReports(
  sessions: readonly LocalCostSessionReport[]
): readonly LocalCostToolReport[] {
  return AI_TOOL_IDS.map((tool) => mergeOneTool(tool, sessions));
}

export class ReadLocalCostUseCase {
  constructor(
    private readonly sink: TelemetrySink,
    private readonly readers: ReadonlyMap<AiToolId, SessionCostReader>,
    private readonly runJournalReader: RunJournalReader
  ) {}

  async execute(options: ReadLocalCostOptions): Promise<ReadLocalCostResult> {
    const at = options.at ?? new Date();
    const sessionIds =
      options.sessionId === undefined ? await this.journalledSessionIds() : [options.sessionId];
    const sessions: LocalCostSessionReport[] = [];
    for (const sessionId of sessionIds) {
      sessions.push({ sessionId, toolReports: await this.readOneSession(sessionId, at) });
    }
    return { sessions, toolReports: mergeToolReports(sessions) };
  }

  /** Every session the journal names, oldest file first. A person has no other way to
   * learn a session identifier, and the journal has recorded every one of them since #663. */
  private async journalledSessionIds(): Promise<readonly string[]> {
    const journals = await this.runJournalReader.list();
    const ids = journals.map((journal) => journal.session?.vendor_id).filter(isPresent);
    return [...new Set(ids)];
  }

  private async readOneSession(
    sessionId: string,
    at: Date
  ): Promise<readonly LocalCostToolReport[]> {
    // Read once per session, never per tool: every reader's candidates for one session are
    // joined against the same journal. A session with no journal at all — the reader's
    // contract promises never to throw for that — yields an empty interval list, so every
    // candidate falls through to unattributed rather than the read failing; the project is
    // `null` for the same reason, never re-derived from wherever this process runs.
    const journal = await this.runJournalReader.read(sessionId);
    const intervals = journal ? buildStepIntervals(journal) : [];
    const project = resolveSessionProject(journal);
    const toolReports: LocalCostToolReport[] = [];
    for (const tool of AI_TOOL_IDS) {
      toolReports.push(await this.readOneTool(tool, sessionId, at, intervals, project));
    }
    return toolReports;
  }

  private async readOneTool(
    tool: AiToolId,
    sessionId: string,
    at: Date,
    intervals: readonly StepInterval[],
    project: SessionProject | null
  ): Promise<LocalCostToolReport> {
    const localRead = getAiToolConfig(tool).telemetryLocalRead;
    if (localRead.kind !== "declared") return notCovered(tool, localRead);
    const attempt = await this.attemptRead(tool, sessionId);
    if ("failure" in attempt) return unreadable(tool, attempt.failure);
    const candidates = attempt.records;
    const recordsStored = await this.storeNewCandidates(
      tool,
      sessionId,
      candidates,
      at,
      intervals,
      project
    );
    return {
      tool,
      status: candidates.length > 0 ? "found" : attempt.sessionFound ? "empty" : "not-found",
      recordsFound: candidates.length,
      recordsStored,
      sessionsFailed: 0,
      ...(localRead.limitation !== undefined ? { reason: localRead.limitation } : {}),
    };
  }

  /** The one place this use case catches, and it catches for a reason the architecture's
   * "use-cases throw, never catch" rule does not cover: this is a fan-out over independent
   * sources, so a reader failing is not one operation that failed but one of several. A
   * throw here would cost every other tool's figures for a session none of them had any
   * trouble with — and, once a sweep reads every journalled session, every other session's
   * too. See https://github.com/ai-driven-dev/framework/issues/689. */
  private async attemptRead(
    tool: AiToolId,
    sessionId: string
  ): Promise<LocalCostReadResult | { readonly failure: string }> {
    const reader = this.readers.get(tool);
    if (!reader) return { records: [], sessionFound: false };
    try {
      return await reader.read(sessionId);
    } catch (error) {
      return { failure: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Matches each candidate against what the sink already holds for this session, on
   * `turn_id` alone — never a hash of the line, since the tool's own file keeps growing
   * as the same record is read again. A candidate with no `turn_id` cannot be matched and
   * is always appended: the reader's contract forbids inventing a key for it. */
  private async storeNewCandidates(
    tool: AiToolId,
    sessionId: string,
    candidates: readonly LocalCostCandidateRecord[],
    at: Date,
    intervals: readonly StepInterval[],
    project: SessionProject | null
  ): Promise<number> {
    if (candidates.length === 0) return 0;
    const existing = await this.sink.readRecordsForVendor(sessionId);
    const storedTurnIds = new Set(
      existing.map((record) => record.turn_id).filter((id): id is string => id !== undefined)
    );
    let stored = 0;
    for (const candidate of candidates) {
      if (candidate.turn_id !== undefined && storedTurnIds.has(candidate.turn_id)) continue;
      await this.sink.appendRecord(
        this.stampProvenanceAndTool(tool, candidate, intervals, project),
        at
      );
      stored++;
    }
    return stored;
  }

  // The caller asked this tool's reader by name — that is the fact this stamps, never
  // inferred from the candidate itself, which the reader's contract forbids it naming.
  private stampProvenanceAndTool(
    tool: AiToolId,
    candidate: LocalCostCandidateRecord,
    intervals: readonly StepInterval[],
    project: SessionProject | null
  ): TelemetrySinkRecord {
    return {
      ...candidate,
      sink_schema_version: SINK_SCHEMA_VERSION,
      provenance: "local-read",
      tool,
      ...this.resolveStepAttribution(candidate, intervals),
      ...(project === null
        ? {}
        : { project_id: project.projectId, project_field: project.projectField }),
    };
  }

  // Where the candidate itself carries `step`, the tool stated it directly (see
  // claude-code-transcript.ts) — exact, and never second-guessed by an interval, which is
  // only ever an inference. Everything else falls back to the journal, joined on the
  // candidate's own moment; a candidate with no moment, or one earlier than every
  // interval, comes back unattributed rather than folded into the nearest step.
  private resolveStepAttribution(
    candidate: LocalCostCandidateRecord,
    intervals: readonly StepInterval[]
  ): Pick<TelemetrySinkRecord, "step_attribution" | "step" | "step_plugin"> {
    if (candidate.step !== undefined) {
      return {
        step_attribution: "tool-stated",
        step: candidate.step,
        step_plugin: candidate.step_plugin,
      };
    }
    const attribution = attributeMoment(intervals, candidate.event_timestamp);
    return { step_attribution: attribution.source, step: attribution.step, step_plugin: undefined };
  }
}
