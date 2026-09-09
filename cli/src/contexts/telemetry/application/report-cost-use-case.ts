import { UnreadableIdentityFileError } from "../../../kernel/errors.js";
import type { Logger } from "../../../kernel/ports/logger.js";
import { AI_TOOL_IDS } from "../../../kernel/tool.js";
import { getAiToolConfig } from "../../tools/domain/registry.js";
import {
  buildCostReport,
  type CostReport,
  type CostReportFilters,
  type CostReportInput,
  type CostReportSessionJournal,
  type CostReportToolCapability,
  type CostReportToolDeclaration,
  type PersonIdentityUnusableCause,
} from "../domain/cost-report.js";
import { buildFlowIntervals } from "../domain/flow-attribution.js";
import type { PersonIdentity } from "../domain/ports/person-identity-reader.js";
import type { PersonIdentityStore } from "../domain/ports/person-identity-store.js";
import type { RunJournal, RunJournalReader } from "../domain/ports/run-journal-reader.js";
import type { TaskBacklogReader } from "../domain/ports/task-backlog-reader.js";
import type { TelemetryEvidenceReader } from "../domain/ports/telemetry-evidence-reader.js";
import type { TelemetrySink, TelemetrySinkPeriodRead } from "../domain/ports/telemetry-sink.js";
import type { ResolvedReportPeriod } from "../domain/report-period.js";
import {
  attributeMoment,
  buildStepIntervals,
  type StepInterval,
} from "../domain/step-attribution.js";
import { buildTaskIntervals } from "../domain/task-attribution.js";
import {
  type TaskBacklogDeclaration,
  taskFolderPathFromIdentity,
} from "../domain/task-backlog-link.js";
import { type TaskIdentity, taskIdentityFromWrittenPath } from "../domain/task-identity.js";
import type { TelemetrySinkRecord } from "../domain/telemetry-sink-record.js";
import type { ReadLocalCostResult, ReadLocalCostUseCase } from "./read-local-cost-use-case.js";

export interface ReportCostOptions {
  /** Already two absolute days, resolved once at the edge — so nothing from here down reads a
   * clock, and the same options answer the same twice. */
  readonly period: ResolvedReportPeriod;
  /** Restrict to the sessions that wrote into this task. Absent reports the whole period. */
  readonly task?: TaskIdentity;
  /** Any of `project`, `step`, `model` and `tool` - each optional, composing with `task`
   * and each other by `and`. */
  readonly filters?: CostReportFilters;
  /** Where to look for `.aidd/config.json` when asking whether the project switch is on. */
  readonly projectRoot: string;
  /** Passed through to the same refusal check the switch itself honours (`AIDD_TELEMETRY=0`),
   * rather than read from `process.env` down in an adapter. */
  readonly env: NodeJS.ProcessEnv;
}

/** What each tool declares about being read at all, as data the pure report consumes — so a
 * report prints the declaration's own reason rather than a zero, `limitation` included. */
function declaredTools(): readonly CostReportToolDeclaration[] {
  return AI_TOOL_IDS.map((tool) => {
    const config = getAiToolConfig(tool);
    const localRead = config.telemetryLocalRead;
    const capability: CostReportToolCapability = {
      localRead: localRead.kind === "declared" ? localRead.supplies : null,
      // No tool declares an export route any more, so nothing could ever supply this. Kept as
      // `null` rather than a type change rippling through the `--json` contract.
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

/** The first and last moment a journal's own lines carry — every line kind, since the question is
 * "was this journal open then". Not capped at the period's end: the sink returns no record past
 * it, so a clock-skewed line can widen the span but never pull a record in. */
const LAST_MILLISECOND_OF_A_SECOND = 999;

function witnessedSpan(journal: RunJournal): { fromMs: number; toMs: number } | undefined {
  const moments = [
    ...journal.boundaries,
    ...journal.taskDeclarations,
    ...journal.filesWritten,
    ...(journal.session ? [journal.session] : []),
  ]
    .map((line) => Date.parse(line.at))
    .filter((atMs) => !Number.isNaN(atMs));
  if (moments.length === 0) return undefined;
  // The end is the end of the second the last line names: the writing hook strips milliseconds
  // from a journal moment while a record carries them, so comparing the two as instants would
  // refuse a record that landed inside the very second the journal last wrote.
  return {
    fromMs: Math.min(...moments),
    toMs: Math.max(...moments) + LAST_MILLISECOND_OF_A_SECOND,
  };
}

function toSessionJournal(
  journal: RunJournal,
  periodEndMs: number
): CostReportSessionJournal | null {
  if (!journal.session) return null;
  const span = witnessedSpan(journal);
  return {
    vendorId: journal.session.vendor_id,
    tool: journal.session.tool,
    ...(journal.session.project_id === undefined ? {} : { projectId: journal.session.project_id }),
    writtenPaths: journal.filesWritten.map((written) => written.path),
    taskIntervals: buildTaskIntervals(journal, periodEndMs),
    flowIntervals: buildFlowIntervals(journal, periodEndMs),
    ...(span === undefined ? {} : { witnessed: span }),
  };
}

/** Every distinct task identity this period's journals could ever key `by_task` on. Each is
 * resolved to its folder's declaration exactly once, never once per record. */
function distinctTaskIdentities(
  journals: readonly RunJournal[],
  periodEndMs: number
): readonly TaskIdentity[] {
  const seen = new Set<TaskIdentity>();
  const identities: TaskIdentity[] = [];
  const remember = (identity: TaskIdentity | null): void => {
    if (identity === null || seen.has(identity)) return;
    seen.add(identity);
    identities.push(identity);
  };
  for (const journal of journals) {
    for (const interval of buildTaskIntervals(journal, periodEndMs)) {
      remember(taskIdentityFromWrittenPath(interval.path));
    }
    // Written paths too, not declared intervals alone: that folder can declare a backlog item,
    // and declarations alone would claim it declares none, from a lookup that never ran.
    for (const written of journal.filesWritten) {
      remember(taskIdentityFromWrittenPath(written.path));
    }
  }
  return identities;
}

/** One read per distinct task identity, through the port, never re-read per record. A reader
 * that throws is not this function's to catch: `TaskBacklogReader.read` promises it never does. */
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

/** The first moment no record in the period can reach: `toDay` itself runs through 23:59:59.999
 * UTC, so this is the *start* of the day after, never `toDay`'s own start — which would cut off
 * a record legitimately timestamped later that day. */
function periodEndMsOf(toDay: string): number {
  return Date.parse(`${toDay}T00:00:00Z`) + MILLISECONDS_PER_DAY;
}

interface PersonIdentityFields {
  readonly identity: PersonIdentity | null;
  readonly identityUnusableCause?: PersonIdentityUnusableCause;
}

/**
 * Never aborts the report over a damaged identity file: that is one dependency's own trouble,
 * and the figures must still come back whole. Names which of the two causes fired rather than
 * folding both into a boolean, and re-throws anything else rather than mislabel an unexpected
 * failure as a familiar-looking caveat.
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

/** `identity` and `identityUnusableCause` together, as `buildCostReport` wants them - pulled out
 * so `execute` reads as one shape assembled from its own reads. */
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

/** Which skill each prompt opened, from the journal's own `step_start` lines. First wins:
 * several steps can open under one prompt, and a prompt names the step its work *began* in —
 * taking the last would answer for the reasoning that produced an earlier step's output. */
function promptToSkill(journal: RunJournal): ReadonlyMap<string, string> {
  const byPrompt = new Map<string, string>();
  for (const boundary of journal.boundaries) {
    if (boundary.type !== "step_start" || boundary.turn_id === undefined) continue;
    if (!byPrompt.has(boundary.turn_id)) byPrompt.set(boundary.turn_id, boundary.skill);
  }
  return byPrompt;
}

/** The step a record's own prompt opened. Outranks the interval, and says so: `prompt-matched`
 * is an identifier two sources agree on, where `journal-interval` infers from moments, so it
 * stays true when two tasks advance at once. Two tasks inside *one* prompt stay indivisible: a
 * billed amount cannot be split without inventing a ratio. */
function matchOnPrompt(
  record: TelemetrySinkRecord,
  byPrompt: ReadonlyMap<string, string> | undefined
): { readonly source: "prompt-matched"; readonly step: string } | null {
  const step = journalNamedStep(record, byPrompt) ?? record.prompt_skill;
  return step === undefined ? null : { source: "prompt-matched", step };
}

/** What the run journal says the record's own prompt opened, asked first: the journal was
 * written by a hook the host itself fired, while `prompt_skill` is read back off a transcript
 * afterwards, so the reading with a witness wins. A session the journal never saw at all falls
 * through to the record's own. */
function journalNamedStep(
  record: TelemetrySinkRecord,
  byPrompt: ReadonlyMap<string, string> | undefined
): string | undefined {
  if (record.prompt_id === undefined || byPrompt === undefined) return undefined;
  return byPrompt.get(record.prompt_id);
}

/** Every record's step, derived rather than trusted from disk: `step_attribution` is stored when
 * the record is read, frozen at whatever the rule answered then. `tool-stated` is left alone,
 * being witnessed rather than inferred, and so is a session this period's journals say nothing
 * about — no interval to judge it against, and a blanker answer is worse than a stale one. */
function withDerivedStep(
  records: readonly TelemetrySinkRecord[],
  journals: readonly RunJournal[]
): readonly TelemetrySinkRecord[] {
  const bySession = new Map<string, readonly StepInterval[]>();
  const skillByPrompt = new Map<string, ReadonlyMap<string, string>>();
  for (const journal of journals) {
    if (!journal.session) continue;
    bySession.set(journal.session.vendor_id, buildStepIntervals(journal));
    skillByPrompt.set(journal.session.vendor_id, promptToSkill(journal));
  }

  return records.map((record) => {
    if (record.step_attribution === "tool-stated") return record;
    const intervals = bySession.get(record.vendor_id);
    if (intervals === undefined) return record;

    const matched = matchOnPrompt(record, skillByPrompt.get(record.vendor_id));
    const derived = matched ?? attributeMoment(intervals, record.event_timestamp);
    // Rebuilt rather than spread over: a record that carried a step from an earlier reading
    // must lose it when the journal no longer names one, and a spread would keep it.
    const { step: _step, step_plugin: _plugin, ...rest } = record;
    return {
      ...rest,
      step_attribution: derived.source,
      ...(derived.step === undefined ? {} : { step: derived.step }),
    };
  });
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
    records: withDerivedStep(read.records, journals),
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

/** Sessions holding at least one stored record a re-read could never be matched against: a
 * re-read reconciles on `turn_id`, and a record carrying none is never indexed, so re-reading
 * such a session would append its records a second time. A host that writes no such identifier
 * must not be silently doubled. */
function sessionsWithAnUnmatchableRecord(
  stored: readonly TelemetrySinkRecord[]
): ReadonlySet<string> {
  const sessions = new Set<string>();
  for (const record of stored) {
    if (record.turn_id === undefined) sessions.add(record.vendor_id);
  }
  return sessions;
}

/** Every session the journal names whose own `session_start` falls inside the period — never
 * "the ones the sink has never seen", which freezes a session still running the moment its first
 * turn is stored. Re-reading is safe, the local read dedupes per `turn_id`; the period bound is
 * what stops a one-week report re-reading every session ever journalled. */
function sessionsToCatchUp(
  stored: readonly TelemetrySinkRecord[],
  journals: readonly RunJournal[],
  fromMs: number,
  periodEndMs: number
): readonly string[] {
  const unmatchable = sessionsWithAnUnmatchableRecord(stored);
  const missing: string[] = [];
  for (const journal of journals) {
    const session = journal.session;
    if (session === undefined || unmatchable.has(session.vendor_id)) continue;
    const atMs = Date.parse(session.at);
    // `periodEndMs` is the first instant *after* the period, which is why this is `>=` and not
    // `>`. Taken from `periodEndMsOf`, never recomputed here: an end computed from `toDay`'s own
    // start excludes the whole of `toDay`, which `--days N` always makes today.
    if (Number.isNaN(atMs) || atMs < fromMs || atMs >= periodEndMs) continue;
    missing.push(session.vendor_id);
  }
  return missing;
}

/**
 * Answers what a period, or one task inside it, cost. Orchestration only: the rules belong to
 * `domain/cost-report.ts`. It names no tool and computes no figure - in particular no amount,
 * since the rates live outside this repository and an amount is only ever reported where a
 * tool's own files already carried one.
 */
export class ReportCostUseCase {
  constructor(
    private readonly sink: TelemetrySink,
    private readonly runJournalReader: RunJournalReader,
    private readonly personIdentityStore: PersonIdentityStore,
    private readonly telemetryEvidenceReader: TelemetryEvidenceReader,
    private readonly taskBacklogReader: TaskBacklogReader,
    /** Where `warnAboutFailures` says what a reader could not answer. */
    private readonly logger: Logger,
    /** Reads the sessions the sink has not caught up with yet, before the report is built.
     * Optional so a caller exercising the report's own rules need not wire it; absent, this
     * reports exactly what the sink already holds. */
    private readonly readLocalCost?: ReadLocalCostUseCase
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
    // Every journal, not only the period's: a journal carries no date in its file name, and the
    // records it is joined to were already selected by their own moments.
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

  /** Reads whatever the sink has not caught up with, then asks it again. `ReadLocalCostUseCase`
   * refuses on its own when measurement is off, so this needs no second gate: a refusal stores
   * nothing and the report describes what was already there. */
  private async catchUp(
    read: TelemetrySinkPeriodRead,
    journals: readonly RunJournal[],
    options: ReportCostOptions,
    period: { from: Date; to: Date; periodEndMs: number }
  ): Promise<TelemetrySinkPeriodRead> {
    if (this.readLocalCost === undefined) return read;
    const missing = sessionsToCatchUp(
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
   * output: a period where every reader threw would otherwise print what a period with no spend
   * prints. Warnings go to stderr, so a `--json` caller's stdout stays one parseable object. */
  private warnAboutFailures(sessionId: string, result: ReadLocalCostResult): void {
    const say = this.logger.warn.bind(this.logger);
    for (const report of result.toolReports) {
      if (report.status !== "unreadable") continue;
      say(
        `telemetry report: ${report.tool} could not be read for session ${sessionId}` +
          `${report.failureReason === undefined ? "" : ` - ${report.failureReason}`}`
      );
    }
  }
}
