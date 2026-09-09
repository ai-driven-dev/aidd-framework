import { errorMessage } from "../../../kernel/describe-error.js";
import type {
  TelemetryLocalReadDeclared,
  TelemetryLocalReadUnsupported,
} from "../../../kernel/measurement.js";
import type { Logger } from "../../../kernel/ports/logger.js";
import type { VersionReader } from "../../../kernel/ports/version-reader.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../kernel/tool.js";
import { getAiToolConfig, journalHostToAiToolId } from "../../tools/domain/registry.js";
import type {
  PersonIdentity,
  PersonIdentityReader,
} from "../domain/ports/person-identity-reader.js";
import type { RunJournalReader } from "../domain/ports/run-journal-reader.js";
import type {
  LocalCostCandidateRecord,
  LocalCostReadResult,
  SessionCostReader,
} from "../domain/ports/session-cost-reader.js";
import type { TelemetryEvidenceReader } from "../domain/ports/telemetry-evidence-reader.js";
import type { TelemetrySink } from "../domain/ports/telemetry-sink.js";
import { resolveSessionProject, type SessionProject } from "../domain/session-project.js";
import {
  attributeMoment,
  buildStepIntervals,
  type StepInterval,
} from "../domain/step-attribution.js";
import { SINK_SCHEMA_VERSION, type TelemetrySinkRecord } from "../domain/telemetry-sink-record.js";
import {
  DEFAULT_TELEMETRY_SINK_RETENTION_DAYS,
  decideTelemetrySinkRetention,
} from "../domain/telemetry-sink-retention.js";

/** Six answers, and only `empty` may ever be printed as a zero — there the zero is the
 * measurement. `not-found` is an observation, `not-asked` a decision not to look, `unreadable` a
 * failure: collapsing any of them into `empty` is how a session nobody measured reads as free. */
export type LocalCostToolStatus =
  | "found"
  | "empty"
  | "not-found"
  | "unreadable"
  | "not-covered"
  | "not-asked";

export interface LocalCostToolReport {
  readonly tool: AiToolId;
  readonly status: LocalCostToolStatus;
  /** Records the reader returned, before dedup — this is what makes "found" and "empty"
   * distinguishable from each other, independent of how many were new. */
  readonly recordsFound: number;
  /** Records newly appended to the sink; a re-read of an already-stored session can be
   * `status: "found"` with `recordsStored: 0`. */
  readonly recordsStored: number;
  /** Why this tool is not covered, or what a covered one's figures cannot yet be used for — both
   * from the declaration. On `unreadable`, what the reader itself said. */
  readonly reason?: string;
  /** Sessions this tool's reader threw on. Separate from `status` because a sweep can read
   * nineteen and fail the twentieth: the figures are real, so the status stays `found`. */
  readonly sessionsFailed: number;
  /** What the last failed session's reader said, when any failed. */
  readonly failureReason?: string;
}

export interface ReadLocalCostOptions {
  /** One session by name. Absent reads every session the run journal knows about — the
   * only route a person has, since nothing tells them a session identifier. */
  readonly sessionId?: string;
  readonly at?: Date;
  /** Where to look for `.aidd/config.json` when asking whether the project switch is on.
   * Required, not defaulted: this is the one route left that writes the sink. */
  readonly projectRoot: string;
  /** Passed through to the same refusal check the switch itself honours
   * (`AIDD_TELEMETRY=0`), rather than read from `process.env` here. */
  readonly env: NodeJS.ProcessEnv;
}

/** What every candidate gets stamped with: facts about where a record came from, never about the
 * record itself. `intervals` and `project` are per-session, `person` per-sweep. */
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
  /** Present only when the sweep refused to run at all. `sessions` and `toolReports` are empty
   * then, and an empty sweep must never be told apart from a refusal by inference. */
  readonly refusedReason?: string;
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined;
}

/** Already-stored records for this session, keyed on `turn_id`; one carrying none is never
 * indexed. Mutable on purpose, so two candidates for one turn in a batch match each other. */
function groupByTurnId(
  records: readonly TelemetrySinkRecord[]
): Map<string, TelemetrySinkRecord[]> {
  const groups = new Map<string, TelemetrySinkRecord[]>();
  for (const record of records) {
    if (record.turn_id === undefined) continue;
    const bucket = groups.get(record.turn_id);
    if (bucket) bucket.push(record);
    else groups.set(record.turn_id, [record]);
  }
  return groups;
}

function indexStoredRecord(
  groups: Map<string, TelemetrySinkRecord[]>,
  record: TelemetrySinkRecord
): void {
  if (record.turn_id === undefined) return;
  const bucket = groups.get(record.turn_id);
  if (bucket) bucket.push(record);
  else groups.set(record.turn_id, [record]);
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

/** Whether `candidate` improves on `stored`: every counter at least as large, one strictly
 * larger. The sink keeps the larger reading rather than let a figure fall back silently. */
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

/** The strongest answer a tool gave anywhere in the sweep. One session read and another failed
 * reports `found` — those figures are real — and `sessionsFailed` carries the failure. */
const STATUS_RANK: readonly LocalCostToolStatus[] = [
  "found",
  "unreadable",
  "empty",
  "not-found",
  "not-covered",
  // Weakest on purpose: one session where this tool was never asked must never outrank
  // another where it actually answered.
  "not-asked",
];

function strongestOf(tool: AiToolId, reports: readonly LocalCostToolReport[]): LocalCostToolReport {
  // The seed for a tool with no report at all: `not-asked` is what "nothing looked at it" means,
  // where `not-found` would report an observation never made.
  const nothingKnown: LocalCostToolReport = {
    tool,
    status: "not-asked",
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
function notCovered(tool: AiToolId, localRead: TelemetryLocalReadUnsupported): LocalCostToolReport {
  return {
    tool,
    status: "not-covered",
    recordsFound: 0,
    recordsStored: 0,
    sessionsFailed: 0,
    reason: localRead.reason,
  };
}

/** This tool's reader was never run, because the journal named another tool. Carries no
 * `reason`: nothing is wrong and nothing was measured, so the status is the whole fact. */
function notAsked(tool: AiToolId): LocalCostToolReport {
  return { tool, status: "not-asked", recordsFound: 0, recordsStored: 0, sessionsFailed: 0 };
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

const REFUSED_REASON =
  "measurement is refused — AIDD_TELEMETRY=0 or the project switch is off; nothing read, " +
  "nothing stored";

/** Reads what every locally-readable tool's own files hold for one session, normalises it into
 * the stored shape, and appends what is not already there. Which tools are readable is each
 * tool's own declaration, read through the registry — this class names no tool. */
export class ReadLocalCostUseCase {
  constructor(
    private readonly sink: TelemetrySink,
    private readonly readers: ReadonlyMap<AiToolId, SessionCostReader>,
    private readonly runJournalReader: RunJournalReader,
    private readonly personIdentityReader: PersonIdentityReader,
    private readonly telemetryEvidenceReader: TelemetryEvidenceReader,
    /** The CLI's own version, stamped on every record this sweep stores. Optional only so a
     * caller exercising another concern need not invent one - absent, the field is omitted
     * from what gets stored, never guessed at. */
    private readonly versionReader?: VersionReader,
    /** Only the retention prune below writes here, and only to warn. Optional so a caller that
     * does not care about housekeeping warnings need not invent a logger. */
    private readonly logger: Logger = { debug() {}, info() {}, warn() {} },
    private readonly retentionDays: number = DEFAULT_TELEMETRY_SINK_RETENTION_DAYS
  ) {}

  async execute(options: ReadLocalCostOptions): Promise<ReadLocalCostResult> {
    // Re-checked here, since this is the sink's one remaining writer: a refusal enforced only by
    // the hook never writing a journal does not hold against `--session <id>`, which never reads
    // one. Before any reader runs, so a refused sweep touches neither the sink nor a tool's files.
    if (
      !(await this.telemetryEvidenceReader.isTelemetryEnabled(options.projectRoot, options.env))
    ) {
      // Told once, by the caller's own display layer, not here too: `this.logger` exists for
      // housekeeping the figures themselves never surface.
      return { sessions: [], toolReports: mergeToolReports([]), refusedReason: REFUSED_REASON };
    }
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
    // A sweep prunes; a single named session does not: `report` catches sessions up one at a
    // time, and a command asked a question must not delete day files as a side effect.
    if (options.sessionId === undefined) await this.pruneOldDayFiles();
    return { sessions, toolReports: mergeToolReports(sessions) };
  }

  /**
   * Keeps the sink inside its retention window, once per sweep — the unit a person invokes.
   * Every failure warns per file: housekeeping must not cost the figures this sweep just
   * stored, and one undeletable file must not spare every older one behind it.
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
        await this.sink.deleteDayFile(this.sink.rootDir, fileName);
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
    // Read once per session, never per tool: every reader's candidates join the same journal. No
    // journal yields empty intervals and a `null` project, so candidates fall through to
    // unattributed rather than the read failing, and the project is never re-derived from cwd.
    const journal = await this.runJournalReader.read(sessionId);
    const attribution: LocalReadAttribution = {
      intervals: journal ? buildStepIntervals(journal) : [],
      project: resolveSessionProject(journal),
      person,
    };
    // Only the tool whose session this is: the journal's `session_start` names the host that
    // wrote it, so asking the others is useless work one of them pays for in process spawns — the
    // OpenCode reader shells out to its binary and waits. Fan out only when the journal names no
    // tool, where the tool is genuinely unknown.
    const host = journal?.session?.tool;
    const namedTool = host === undefined ? null : journalHostToAiToolId(host);
    const toolReports: LocalCostToolReport[] = [];
    for (const tool of AI_TOOL_IDS) {
      toolReports.push(await this.answerFor(tool, namedTool, sessionId, at, attribution));
    }
    return toolReports;
  }

  /** What this tool has to say about this session. Coverage first, always: "nothing here can read
   * this tool" is true of every session, and it carries the declaration's own reason. */
  private async answerFor(
    tool: AiToolId,
    namedTool: AiToolId | null,
    sessionId: string,
    at: Date,
    attribution: LocalReadAttribution
  ): Promise<LocalCostToolReport> {
    const localRead = getAiToolConfig(tool).telemetryLocalRead;
    if (localRead.kind !== "declared") return notCovered(tool, localRead);
    if (namedTool !== null && tool !== namedTool) return notAsked(tool);
    return this.readOneTool(tool, localRead, sessionId, at, attribution);
  }

  private async readOneTool(
    tool: AiToolId,
    localRead: TelemetryLocalReadDeclared,
    sessionId: string,
    at: Date,
    attribution: LocalReadAttribution
  ): Promise<LocalCostToolReport> {
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

  /** The one place this use case catches: a fan-out over independent sources, where one reader
   * failing must not cost every other tool's figures, nor every other session's. */
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

  /** Matches on `turn_id` alone, never a hash of the line: the tool's own file keeps growing as
   * the same record is read again. A stored turn is dropped unless a `request` local-read record
   * strictly improves on it, which appends a second line for `collapseSupersededTurns` to
   * reconcile. A correction is a larger counter, never a field the stored record lacks. */
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
      const record = this.stampProvenanceAndTool(tool, candidate, attribution);
      await this.sink.appendRecord(record, at);
      indexStoredRecord(byTurnId, record);
      stored++;
    }
    return stored;
  }

  /** Never for a `kind: "session"` record: Copilot's shutdown total shares this match but is a
   * one-shot cumulative figure, which a re-read would start doubling. Otherwise only a strict
   * improvement on the largest stored, never gated on `turn_end` — a larger candidate is itself
   * proof the stored reading was not final. */
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
      ...(this.versionReader === undefined ? {} : { cli_version: this.versionReader.get() }),
    };
  }

  // Where the candidate carries `step`, the tool stated it directly — exact, never second-guessed
  // by an interval, which is only an inference. A candidate with no moment, or one earlier than
  // every interval, comes back unattributed rather than folded into the nearest step.
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
