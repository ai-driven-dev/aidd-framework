import { UnreadableIdentityFileError } from "../../../domain/errors.js";
import {
  buildCostReport,
  type CostReport,
  type CostReportFilters,
  type CostReportInput,
  type CostReportSessionJournal,
  type CostReportToolCapability,
  type CostReportToolDeclaration,
  type PersonIdentityUnusableCause,
} from "../../../domain/models/cost-report.js";
import { buildFlowIntervals } from "../../../domain/models/flow-attribution.js";
import type { ResolvedReportPeriod } from "../../../domain/models/report-period.js";
import { buildTaskIntervals } from "../../../domain/models/task-attribution.js";
import {
  type TaskBacklogDeclaration,
  taskFolderPathFromIdentity,
} from "../../../domain/models/task-backlog-link.js";
import {
  type TaskIdentity,
  taskIdentityFromWrittenPath,
} from "../../../domain/models/task-identity.js";
import type { TelemetrySinkRecord } from "../../../domain/models/telemetry-sink-record.js";
import { AI_TOOL_IDS } from "../../../domain/models/tool-ids.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { PersonIdentity } from "../../../domain/ports/person-identity-reader.js";
import type { PersonIdentityStore } from "../../../domain/ports/person-identity-store.js";
import type { RunJournal, RunJournalReader } from "../../../domain/ports/run-journal-reader.js";
import type { TaskBacklogReader } from "../../../domain/ports/task-backlog-reader.js";
import type { TelemetryEvidenceReader } from "../../../domain/ports/telemetry-evidence-reader.js";
import type {
  TelemetrySink,
  TelemetrySinkPeriodRead,
} from "../../../domain/ports/telemetry-sink.js";
import { getAiToolConfig } from "../../../domain/tools/registry.js";
import type { ReadLocalCostResult, ReadLocalCostUseCase } from "./read-local-cost-use-case.js";

export interface ReportCostOptions {
  /** Already two absolute days. Resolving what a caller asked for is
   * `domain/models/report-period.ts`'s job and happens once, at the edge — so nothing from
   * here down reads a clock, and the same options answer the same twice. */
  readonly period: ResolvedReportPeriod;
  /** Restrict to the sessions that wrote into this task. Absent reports the whole period. */
  readonly task?: TaskIdentity;
  /** Any of `project`, `step`, `model` and `tool` - each optional, composing with `task`
   * and each other by `and`. */
  readonly filters?: CostReportFilters;
  /** Where to look for `.aidd/config.json` when asking whether the project switch is on. */
  readonly projectRoot: string;
  /** Passed through to the same refusal check the switch itself honours
   * (`AIDD_TELEMETRY=0`), rather than read from `process.env` down in an adapter a report
   * cannot otherwise reach the caller's environment through. */
  readonly env: NodeJS.ProcessEnv;
}

/** What each tool declares about being read at all, as data the pure report consumes. A
 * tool whose own files cannot be read is `not-covered` with the reason its declaration
 * gives, so a report prints why rather than a zero; a readable tool carries its
 * `limitation` forward for the same reason, since a caveat that stays in a source comment
 * reaches nobody downstream. */
function declaredTools(): readonly CostReportToolDeclaration[] {
  return AI_TOOL_IDS.map((tool) => {
    const config = getAiToolConfig(tool);
    const localRead = config.telemetryLocalRead;
    const capability: CostReportToolCapability = {
      localRead: localRead.kind === "declared" ? localRead.supplies : null,
      // No tool declares an export route any more — "one route, and every sentence about
      // it true" deleted the OTLP receiver, so nothing configures one and nothing could
      // ever supply this. Always `null`, the same value a tool with no declaration at all
      // already carried, rather than a type change that would ripple through the `--json`
      // contract for a capability that can no longer exist either way.
      export: null,
      journalAttributable: config.telemetryJournalHost !== undefined,
      taskAttributable: config.telemetryTaskAttributable,
    };
    if (localRead.kind === "declared") {
      return {
        tool,
        coverage: "covered" as const,
        ...(localRead.limitation === undefined ? {} : { reason: localRead.limitation }),
        capability,
      };
    }
    return {
      tool,
      coverage: "not-covered" as const,
      ...(localRead.kind === "unsupported" ? { reason: localRead.reason } : {}),
      capability,
    };
  });
}

function toSessionJournal(
  journal: RunJournal,
  periodEndMs: number
): CostReportSessionJournal | null {
  if (!journal.session) return null;
  return {
    vendorId: journal.session.vendor_id,
    tool: journal.session.tool,
    ...(journal.session.project_id === undefined ? {} : { projectId: journal.session.project_id }),
    writtenPaths: journal.filesWritten.map((written) => written.path),
    taskIntervals: buildTaskIntervals(journal, periodEndMs),
    flowIntervals: buildFlowIntervals(journal, periodEndMs),
  };
}

/** Every distinct task identity this period's journals could ever key `by_task` on - the
 * same declared intervals `declaredTaskKeyOf` reads from, built once here from the raw
 * `RunJournal`s rather than the already-mapped session journals, so it needs no restructure
 * of `toReportInput`'s own mapping. Each identity is resolved to its folder's declaration
 * exactly once, never once per record. Order is incidental; the report only ever looks this
 * map up by key. */
function distinctTaskIdentities(
  journals: readonly RunJournal[],
  periodEndMs: number
): readonly TaskIdentity[] {
  const seen = new Set<TaskIdentity>();
  const identities: TaskIdentity[] = [];
  for (const journal of journals) {
    for (const interval of buildTaskIntervals(journal, periodEndMs)) {
      const identity = taskIdentityFromWrittenPath(interval.path);
      if (identity !== null && !seen.has(identity)) {
        seen.add(identity);
        identities.push(identity);
      }
    }
  }
  return identities;
}

/** One read per distinct task identity, through the port - never the filesystem directly,
 * and never re-read per record. A reader that throws is not this function's to catch:
 * `TaskBacklogReader.read` promises it never does. */
async function taskBacklogDeclarationsOf(
  reader: TaskBacklogReader,
  journals: readonly RunJournal[],
  periodEndMs: number
): Promise<ReadonlyMap<TaskIdentity, TaskBacklogDeclaration>> {
  const declarations = new Map<TaskIdentity, TaskBacklogDeclaration>();
  for (const identity of distinctTaskIdentities(journals, periodEndMs)) {
    declarations.set(identity, await reader.read(taskFolderPathFromIdentity(identity)));
  }
  return declarations;
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** The first moment no record `readRecordsInPeriod` could ever return can fall on or after -
 * `toDay` itself runs through 23:59:59.999 UTC, so this is the *start* of the day after.
 * `buildTaskIntervals` clamps an unclosed interval's end here rather than at `toDay`'s own
 * start, which would wrongly cut off a record legitimately timestamped later on `toDay`. */
function periodEndMsOf(toDay: string): number {
  return Date.parse(`${toDay}T00:00:00Z`) + MILLISECONDS_PER_DAY;
}

interface PersonIdentityFields {
  readonly identity: PersonIdentity | null;
  readonly identityUnusableCause?: PersonIdentityUnusableCause;
}

/**
 * Answers what a report's own person-resolution inputs should be, without ever aborting
 * the report over it — the same fan-out reasoning `ReadLocalCostUseCase.attemptRead`
 * documents for a local-cost reader failing on one session: a damaged identity file is one
 * dependency's own trouble, never the report's, and the figures must still come back
 * whole.
 *
 * Names which of the two possible causes actually fired, rather than folding both into one
 * boolean: `readStrict()` answers "no identity at all" with `null`, never a throw, so that
 * cause is read off the return value directly - it is not reachable from a `catch`.
 * `readStrict()` throws `UnreadableIdentityFileError` for a declared file that could not be
 * read back, which is the one thrown cause this recognises. Anything else thrown is not
 * this function's to explain and is re-thrown rather than mislabelled as either named
 * cause - a report that hides an unexpected failure behind a familiar-looking caveat would
 * be worse than one that surfaces it.
 */
async function personIdentityFields(store: PersonIdentityStore): Promise<PersonIdentityFields> {
  try {
    const identity = await store.readStrict();
    return identity === null ? { identity: null, identityUnusableCause: "absent" } : { identity };
  } catch (error) {
    if (error instanceof UnreadableIdentityFileError) {
      return { identity: null, identityUnusableCause: "unreadable" };
    }
    throw error;
  }
}

/** `identity` and `identityUnusableCause` together, as `buildCostReport` wants them - pulled
 * out on its own so `execute` reads as one shape assembled from its own reads, not a wall of
 * field-by-field assignments (the same reason `cost-report.ts`'s own `readFields` exists). */
function identityInputFields(
  fields: PersonIdentityFields
): Pick<CostReportInput, "identity" | "identityUnusableCause"> {
  return {
    identity: fields.identity,
    ...(fields.identityUnusableCause === undefined
      ? {}
      : { identityUnusableCause: fields.identityUnusableCause }),
  };
}

/** Every gathered read, folded into the one shape `buildCostReport` wants - kept on its own
 * so `execute` reads as "gather, then assemble," not a wall of field assignments. */
function toReportInput(
  options: ReportCostOptions,
  read: Awaited<ReturnType<TelemetrySink["readRecordsInPeriod"]>>,
  journals: readonly RunJournal[],
  identity: PersonIdentityFields,
  measurementEnabled: boolean,
  taskBacklogDeclarations: ReadonlyMap<TaskIdentity, TaskBacklogDeclaration>
): CostReportInput {
  const { fromDay, toDay } = options.period;
  const periodEndMs = periodEndMsOf(toDay);
  return {
    fromDay,
    toDay,
    records: read.records,
    journals: journals
      .map((journal) => toSessionJournal(journal, periodEndMs))
      .filter((journal) => journal !== null),
    declaredTools: declaredTools(),
    undatedRecords: read.undated.length,
    unreadableLines: read.skippedLines,
    ...(options.task === undefined ? {} : { task: options.task }),
    ...(options.filters === undefined ? {} : { filters: options.filters }),
    knownValues: read.knownValues,
    measurementEnabled,
    taskBacklogDeclarations,
    ...identityInputFields(identity),
  };
}

/**
 * Answers what a period, or one task inside it, cost.
 *
 * Orchestration only: the two reads belong to their ports, the rules belong to
 * `domain/models/cost-report.ts`, and what is left is asking for one period's records and
 * one period's journals and handing both over. It names no tool and computes no figure -
 * in particular no amount, since the rates live outside this repository and an amount is
 * only ever reported where a tool's own files already carried one.
 */
/** Sessions the journal knows about that the period's stored records say nothing about,
 * and whose own session_start falls inside the period.
 *
 * Both halves matter. Without the first, a report re-reads sessions already stored, for
 * nothing. Without the second, a report over one week would re-read every session a
 * repository has ever journalled, and the cost of catching up would grow with the age of
 * the project rather than with the length of the period asked about.
 *
 * A session that genuinely billed nothing stays in this list, and is re-read on every
 * report over its own week. That is the honest cost of not keeping a second file recording
 * which sessions have already been looked at — a file whose only job would be to remember
 * an answer the sink can already be asked for. */
function sessionsNotYetRead(
  stored: readonly TelemetrySinkRecord[],
  journals: readonly RunJournal[],
  fromMs: number,
  periodEndMs: number
): readonly string[] {
  const known = new Set(stored.map((record) => record.vendor_id));
  const missing: string[] = [];
  for (const journal of journals) {
    const session = journal.session;
    if (session === undefined || known.has(session.vendor_id)) continue;
    const atMs = Date.parse(session.at);
    // `periodEndMs` is the first instant *after* the period, which is why this is `>=` and
    // not `>`. Computing an end here rather than taking the one `periodEndMsOf` already
    // gives is how the first version of this excluded the whole of `toDay`: a report over
    // the single day work happened on answered "nothing in this period", and `--days N`
    // sets `toDay` to today, so the default report never caught up anything journalled
    // today — the one case this exists for.
    if (Number.isNaN(atMs) || atMs < fromMs || atMs >= periodEndMs) continue;
    missing.push(session.vendor_id);
  }
  return missing;
}

export class ReportCostUseCase {
  constructor(
    private readonly sink: TelemetrySink,
    private readonly runJournalReader: RunJournalReader,
    private readonly personIdentityStore: PersonIdentityStore,
    private readonly telemetryEvidenceReader: TelemetryEvidenceReader,
    private readonly taskBacklogReader: TaskBacklogReader,
    /** Reads the sessions the sink has not caught up with yet, before the report is built.
     * Optional so a caller exercising the report's own rules need not wire a reader it is
     * not asking about; absent, this reports exactly what the sink already holds. Production
     * wiring always supplies it — that is what lets `report` be the only command a person
     * runs, with `read` kept for asking on purpose rather than as a step to remember. */
    private readonly readLocalCost?: ReadLocalCostUseCase,
    /** Only `warnAboutFailures` writes here. Optional for the same reason `readLocalCost`
     * is: a caller asking about the report's own rules wires neither. */
    private readonly logger?: Logger
  ) {}

  /** Whether the project switch is on right now - independent of the sink and the journal,
   * so gathered on its own rather than folded into either of their reads. */
  private async measurementEnabled(options: ReportCostOptions): Promise<boolean> {
    return this.telemetryEvidenceReader.isTelemetryEnabled(options.projectRoot, options.env);
  }

  async execute(options: ReportCostOptions): Promise<CostReport> {
    const { fromDay, toDay } = options.period;
    const from = new Date(`${fromDay}T00:00:00Z`);
    const to = new Date(`${toDay}T00:00:00Z`);
    const periodEndMs = periodEndMsOf(toDay);
    // Every journal, not only the period's: a journal carries no date in its file name, and
    // the records it is joined to were already selected by their own moments. Filtering the
    // journals as well would only be a second, weaker selection over the same thing.
    const journals = await this.runJournalReader.list();
    const read = await this.catchUp(
      await this.sink.readRecordsInPeriod(from, to),
      journals,
      options,
      { from, to, periodEndMs }
    );
    const identity = await personIdentityFields(this.personIdentityStore);
    const measurementEnabled = await this.measurementEnabled(options);
    const taskBacklogDeclarations = await taskBacklogDeclarationsOf(
      this.taskBacklogReader,
      journals,
      periodEndMsOf(toDay)
    );

    return buildCostReport(
      toReportInput(options, read, journals, identity, measurementEnabled, taskBacklogDeclarations)
    );
  }

  /** Reads whatever the sink has not caught up with, then asks it again.
   *
   * `ReadLocalCostUseCase` refuses on its own when the project switch is off or the person
   * refused, so this needs no second gate: a refusal simply stores nothing and the report
   * describes what was already there. Silent on success by design — the figures are the
   * announcement, and `read` remains the command for asking what each tool answered. */
  private async catchUp(
    read: TelemetrySinkPeriodRead,
    journals: readonly RunJournal[],
    options: ReportCostOptions,
    period: { from: Date; to: Date; periodEndMs: number }
  ): Promise<TelemetrySinkPeriodRead> {
    if (this.readLocalCost === undefined) return read;
    const missing = sessionsNotYetRead(
      read.records,
      journals,
      period.from.getTime(),
      period.periodEndMs
    );
    if (missing.length === 0) return read;
    for (const sessionId of missing) {
      this.warnAboutFailures(
        sessionId,
        await this.readLocalCost.execute({
          sessionId,
          projectRoot: options.projectRoot,
          env: options.env,
        })
      );
    }
    return this.sink.readRecordsInPeriod(period.from, period.to);
  }

  /** Says what a reader could not answer, since behind a report nobody sees the read's own
   * output any more.
   *
   * Silence on success is a choice; silence on failure is the failure this whole layer
   * exists to refuse. A period where every reader threw would otherwise print exactly what
   * a period with no spend prints. Warnings go to stderr, so a `--json` caller's stdout
   * stays one parseable object. */
  private warnAboutFailures(sessionId: string, result: ReadLocalCostResult): void {
    // A missing logger cannot be allowed to swallow the failures this exists to surface —
    // that is the rule this method is named for, applied to itself. Production always wires
    // one (`deps.ts`); a caller that does not gets the same sentences on stderr rather than
    // silence, because a report that quietly drops unreadable sessions reads as low spend.
    const say =
      this.logger?.warn.bind(this.logger) ?? ((line: string) => process.stderr.write(`${line}\n`));
    for (const report of result.toolReports) {
      if (report.status !== "unreadable") continue;
      say(
        `telemetry report: ${report.tool} could not be read for session ${sessionId}` +
          `${report.failureReason === undefined ? "" : ` - ${report.failureReason}`}`
      );
    }
  }
}
