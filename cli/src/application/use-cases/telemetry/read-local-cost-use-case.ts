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
import {
  DEFAULT_TELEMETRY_SINK_RETENTION_DAYS,
  decideTelemetrySinkRetention,
} from "../../../domain/models/telemetry-sink-retention.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../domain/models/tool-ids.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type {
  PersonIdentity,
  PersonIdentityReader,
} from "../../../domain/ports/person-identity-reader.js";
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

/** What every candidate from one session gets stamped with, gathered once and carried as
 * one value rather than three parameters — `intervals` and `project` are per-session,
 * `person` is per-sweep, but all three are facts about where a record came from, never
 * about the record itself. */
interface LocalReadAttribution {
  readonly intervals: readonly StepInterval[];
  readonly project: SessionProject | null;
  readonly person: PersonIdentity | null;
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

/** Every already-stored record for this session, keyed on its own `turn_id` — a record
 * with none is not indexed, the same as it is never matched by a re-read. */
function groupByTurnId(
  records: readonly TelemetrySinkRecord[]
): ReadonlyMap<string, readonly TelemetrySinkRecord[]> {
  const groups = new Map<string, TelemetrySinkRecord[]>();
  for (const record of records) {
    if (record.turn_id === undefined) continue;
    const bucket = groups.get(record.turn_id);
    if (bucket) bucket.push(record);
    else groups.set(record.turn_id, [record]);
  }
  return groups;
}

const LOCAL_READ_TURN_COUNTER_KEYS = [
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_creation_tokens",
] as const;

/** How much of a turn a record accounts for — used only to find the largest of several
 * still-open readings of it, never stored, never itself summed into a total. */
function counterWeight(record: TelemetrySinkRecord): number {
  return LOCAL_READ_TURN_COUNTER_KEYS.reduce((sum, key) => sum + (record[key] ?? 0), 0);
}

/** Whether `candidate` genuinely improves on `stored` — every counter at least as large,
 * and at least one strictly larger. A candidate that would drop a counter `stored` already
 * carried, or read smaller on any one, is never an improvement: the sink keeps the larger
 * reading rather than letting a figure fall back silently (metrics-contract.md, "The other
 * way to double count"). */
function strictlyImprovesOn(
  stored: TelemetrySinkRecord,
  candidate: LocalCostCandidateRecord
): boolean {
  let improved = false;
  for (const key of LOCAL_READ_TURN_COUNTER_KEYS) {
    const before = stored[key];
    const after = candidate[key];
    if (before === undefined) {
      if (after !== undefined) improved = true;
      continue;
    }
    if (after === undefined || after < before) return false;
    if (after > before) improved = true;
  }
  return improved;
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

// Local rather than `infrastructure/json-file.ts`'s `describeError`: this layer does not
// import infrastructure, and the check at `scripts/check-cli-layering.mjs` enforces it.
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ReadLocalCostUseCase {
  constructor(
    private readonly sink: TelemetrySink,
    private readonly readers: ReadonlyMap<AiToolId, SessionCostReader>,
    private readonly runJournalReader: RunJournalReader,
    private readonly personIdentityReader: PersonIdentityReader,
    /** Only the retention prune below writes here, and only to warn. Optional because a
     * caller that does not care about housekeeping warnings should not have to invent a
     * logger to read its own figures. */
    private readonly logger: Logger = { debug() {}, info() {}, warn() {} },
    private readonly retentionDays: number = DEFAULT_TELEMETRY_SINK_RETENTION_DAYS
  ) {}

  async execute(options: ReadLocalCostOptions): Promise<ReadLocalCostResult> {
    const at = options.at ?? new Date();
    const sessionIds =
      options.sessionId === undefined ? await this.journalledSessionIds() : [options.sessionId];
    // Resolved once for the whole sweep, not per session: this is a fact about the machine
    // this process is running on, not about any one session it reads.
    const person = await this.personIdentityReader.read();
    const sessions: LocalCostSessionReport[] = [];
    for (const sessionId of sessionIds) {
      sessions.push({ sessionId, toolReports: await this.readOneSession(sessionId, at, person) });
    }
    await this.pruneOldDayFiles();
    return { sessions, toolReports: mergeToolReports(sessions) };
  }

  /**
   * Keeps the sink inside its retention window, once per sweep.
   *
   * This ran on the export receiver until that route was deleted, and it was the sink's
   * only pruning: `read` is now the one thing that writes a day file, so it is the one
   * thing that can bound how many there are. Once per sweep rather than per new day file,
   * because a sweep is already the unit a person invokes.
   *
   * Every failure is a warning and never a throw, per file: housekeeping must not cost the
   * figures this sweep just stored, and one undeletable file must not spare every older
   * one behind it.
   */
  private async pruneOldDayFiles(): Promise<void> {
    let prune: readonly string[];
    try {
      prune = decideTelemetrySinkRetention(
        await this.sink.listDayFiles(),
        this.retentionDays
      ).prune;
    } catch (error) {
      this.logger.warn(`telemetry read: retention prune failed - ${errorMessage(error)}`);
      return;
    }
    for (const fileName of prune) {
      try {
        await this.sink.deleteDayFile(fileName);
      } catch (error) {
        this.logger.warn(`telemetry read: could not delete ${fileName} - ${errorMessage(error)}`);
      }
    }
  }

  /** Every session the journal names, oldest file first. A person has no other way to
   * learn a session identifier, and the journal has recorded every one of them. */
  private async journalledSessionIds(): Promise<readonly string[]> {
    const journals = await this.runJournalReader.list();
    const ids = journals.map((journal) => journal.session?.vendor_id).filter(isPresent);
    return [...new Set(ids)];
  }

  private async readOneSession(
    sessionId: string,
    at: Date,
    person: PersonIdentity | null
  ): Promise<readonly LocalCostToolReport[]> {
    // Read once per session, never per tool: every reader's candidates for one session are
    // joined against the same journal. A session with no journal at all — the reader's
    // contract promises never to throw for that — yields an empty interval list, so every
    // candidate falls through to unattributed rather than the read failing; the project is
    // `null` for the same reason, never re-derived from wherever this process runs.
    const journal = await this.runJournalReader.read(sessionId);
    const attribution: LocalReadAttribution = {
      intervals: journal ? buildStepIntervals(journal) : [],
      project: resolveSessionProject(journal),
      person,
    };
    const toolReports: LocalCostToolReport[] = [];
    for (const tool of AI_TOOL_IDS) {
      toolReports.push(await this.readOneTool(tool, sessionId, at, attribution));
    }
    return toolReports;
  }

  private async readOneTool(
    tool: AiToolId,
    sessionId: string,
    at: Date,
    attribution: LocalReadAttribution
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
      attribution
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
   * is always appended: the reader's contract forbids inventing a key for it.
   *
   * A candidate whose `turn_id` *is* already stored is dropped — unless it is a
   * `kind: "request"` local-read record correcting an earlier, still-open reading of the
   * same turn (`isLocalReadTurnCorrection`), the one case this match used to refuse
   * outright. The correction lands as a second line, never an edit: the sink is
   * append-only, and `cost-report.ts`'s `collapseSupersededTurns` is what later reconciles
   * the two readings into one. */
  private async storeNewCandidates(
    tool: AiToolId,
    sessionId: string,
    candidates: readonly LocalCostCandidateRecord[],
    at: Date,
    attribution: LocalReadAttribution
  ): Promise<number> {
    if (candidates.length === 0) return 0;
    const byTurnId = groupByTurnId(await this.sink.readRecordsForVendor(sessionId));
    let stored = 0;
    for (const candidate of candidates) {
      const prior = candidate.turn_id === undefined ? undefined : byTurnId.get(candidate.turn_id);
      if (prior && !this.isLocalReadTurnCorrection(candidate, prior)) continue;
      await this.sink.appendRecord(this.stampProvenanceAndTool(tool, candidate, attribution), at);
      stored++;
    }
    return stored;
  }

  /** Whether `candidate` should land as a correction to `prior` — every record already
   * stored under this `turn_id`. Never for a `kind: "session"` record: Copilot's shutdown
   * total shares this match (it is keyed on the shutdown event's own id), but it is a
   * one-shot cumulative figure with no provisional reading to correct, and matching it here
   * would let a re-read start doubling it. Otherwise, only when the candidate strictly
   * improves on the largest already stored — never gated on whether the run journal's own
   * `turn_end` has been seen: a strictly larger candidate is itself proof the stored reading
   * was not final, whatever the journal says about the clock, and a re-read that brings
   * nothing larger is already a no-op without needing to ask the journal anything. */
  private isLocalReadTurnCorrection(
    candidate: LocalCostCandidateRecord,
    prior: readonly TelemetrySinkRecord[]
  ): boolean {
    if (candidate.kind !== "request") return false;
    const priorReads = prior.filter((r) => r.kind === "request" && r.provenance === "local-read");
    if (priorReads.length === 0) return false;
    const largest = priorReads.reduce((best, r) =>
      counterWeight(r) > counterWeight(best) ? r : best
    );
    return strictlyImprovesOn(largest, candidate);
  }

  // The caller asked this tool's reader by name — that is the fact this stamps, never
  // inferred from the candidate itself, which the reader's contract forbids it naming.
  private stampProvenanceAndTool(
    tool: AiToolId,
    candidate: LocalCostCandidateRecord,
    { intervals, project, person }: LocalReadAttribution
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
      ...(person === null ? {} : { person_id: person.personId }),
      ...(person?.displayName === undefined ? {} : { person_display_name: person.displayName }),
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
