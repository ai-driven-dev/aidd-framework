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
import {
  attributeMoment,
  buildStepIntervals,
  type StepInterval,
} from "../../../domain/models/step-attribution.js";
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

/** The first and last moment a journal's own lines carry, or nothing when not one of them
 * carries a moment this reader can parse. Every line kind counts, not only the kinds an
 * interval opens or closes on: the question this answers is "was this journal open then",
 * and a written file witnesses that as surely as a boundary does.
 *
 * Not capped at the period's end, unlike an unclosed interval. This span is only ever asked
 * whether it contains a record's moment, and the sink never returns a record past the
 * period end, so a clock-skewed line can widen the span past a moment no record can reach -
 * it cannot pull one in. */
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
  // The end is the end of the second the last line names, not that second's first instant.
  // A journal moment IS a second - `nowIso()` in the writing hook strips the milliseconds
  // - while a record carries them, so comparing the two as instants refuses a record that
  // landed inside the very second the journal last wrote. Measured, that rounding cost one
  // record of 1073 on a real session. The start needs no such widening: a truncated moment
  // already sits at the first instant of its own second.
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
  const remember = (identity: TaskIdentity | null): void => {
    if (identity === null || seen.has(identity)) return;
    seen.add(identity);
    identities.push(identity);
  };
  for (const journal of journals) {
    for (const interval of buildTaskIntervals(journal, periodEndMs)) {
      remember(taskIdentityFromWrittenPath(interval.path));
    }
    // Written paths too, not declared intervals alone: a task the written-file route names
    // has a folder like any other, and that folder can declare a backlog item. Resolving
    // from declarations alone would send every inferred record to "this task declares no
    // backlog item" - a claim about the task, produced by a lookup that never ran.
    for (const written of journal.filesWritten) {
      remember(taskIdentityFromWrittenPath(written.path));
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

/** Which skill each prompt opened, from the journal's own `step_start` lines.
 *
 * **First wins.** Three steps can open under one prompt — measured on a live session, where
 * `aidd-orchestrator:01-sdlc`, `aidd-pm:04-spec` and `aidd-dev:01-plan` all carried
 * `839ab4a8-…`. A prompt therefore names the step its work *began* in, and a later opener
 * never rewrites it: taking the last would answer "plan" for the reasoning that produced the
 * spec, which is a different claim and a wrong one. */
function promptToSkill(journal: RunJournal): ReadonlyMap<string, string> {
  const byPrompt = new Map<string, string>();
  for (const boundary of journal.boundaries) {
    if (boundary.type !== "step_start" || boundary.turn_id === undefined) continue;
    if (!byPrompt.has(boundary.turn_id)) byPrompt.set(boundary.turn_id, boundary.skill);
  }
  return byPrompt;
}

/** The step a record's own prompt opened, where both sides name the same one.
 *
 * Outranks the interval, and says so: `prompt-matched` is an identifier two sources agree
 * on, where `journal-interval` is an inference from moments. It is the only reading that
 * stays true when two tasks advance at once — two prompts remain two prompts however their
 * moments overlap. Two tasks inside *one* prompt stay indivisible: a billed amount cannot be
 * split without inventing a ratio, and this returns the one step that prompt opened. */
function matchOnPrompt(
  record: TelemetrySinkRecord,
  byPrompt: ReadonlyMap<string, string> | undefined
): { readonly source: "prompt-matched"; readonly step: string } | null {
  const step = journalNamedStep(record, byPrompt) ?? record.prompt_skill;
  return step === undefined ? null : { source: "prompt-matched", step };
}

/** What the run journal says the record's own prompt opened, asked first.
 *
 * Both sides name the same fact from the same identifier, so they can only disagree if one
 * of them is wrong — and the journal was written by a hook the host itself fired, while
 * `prompt_skill` is read back off a transcript afterwards. The reading with a witness wins.
 *
 * A session the journal never saw at all has no answer here and falls through to the
 * record's own. Measured on the real sink: 28 prompts across 22 days ran before the hook
 * was installed, and 318 records are named by that route and by nothing else. */
function journalNamedStep(
  record: TelemetrySinkRecord,
  byPrompt: ReadonlyMap<string, string> | undefined
): string | undefined {
  if (record.prompt_id === undefined || byPrompt === undefined) return undefined;
  return byPrompt.get(record.prompt_id);
}

/** Every record's step, taken from the journal rather than from the record.
 *
 * **A judgement is derived; only an observation is trusted from disk.** `step_attribution`
 * is written into the record when it is read, so a record stored before a rule was
 * corrected keeps whatever that rule answered — for good. Measured on a live sink: it
 * reported 91% `unattributed` while a fresh read of the very same session, under the same
 * build, reported 0%. Nothing in the store was wrong when it was written; it was simply
 * frozen at the moment the least was known about it.
 *
 * `tool-stated` is left alone. The tool naming a skill on the line carrying the counters is
 * something it witnessed, not something anyone inferred, and no journal can improve on it.
 *
 * A session the period's journals say nothing about is left alone too — there is no
 * interval to judge it against, and overwriting a stored answer with a blanker one would
 * trade a stale reading for no reading at all. */
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

/**
 * Answers what a period, or one task inside it, cost.
 *
 * Orchestration only: the two reads belong to their ports, the rules belong to
 * `domain/models/cost-report.ts`, and what is left is asking for one period's records and
 * one period's journals and handing both over. It names no tool and computes no figure -
 * in particular no amount, since the rates live outside this repository and an amount is
 * only ever reported where a tool's own files already carried one.
 */
/** Sessions holding at least one stored record a re-read could never be matched against.
 *
 * A re-read is reconciled with what is stored on `turn_id`, and `groupByTurnId` indexes
 * nothing without one — so re-reading such a session appends its records a second time.
 * That was a documented edge while only unseen sessions were read; once every session in
 * the period is, it would double a figure on every report.
 *
 * Found by the reference week going from 7 requests to 10, not by reasoning: its transcripts
 * are hand-written and carry no `requestId`. Claude Code writes one on every line — 0 of 810
 * records without one on a live sink — but a host that does not must not be silently
 * doubled, and "in general it has one" is not a guard. */
function sessionsWithAnUnmatchableRecord(
  stored: readonly TelemetrySinkRecord[]
): ReadonlySet<string> {
  const sessions = new Set<string>();
  for (const record of stored) {
    if (record.turn_id === undefined) sessions.add(record.vendor_id);
  }
  return sessions;
}

/** Every session the journal names whose own `session_start` falls inside the period.
 *
 * **Not "the ones the sink has never seen".** That was the rule until 2026-09-04, keyed on
 * whether a session appeared in the stored records at all, and it froze a session the
 * moment its first turn was stored: a session still running was declared read and never
 * looked at again. Measured live — the sink held 285 records while the transcript had 541,
 * and `report` caught up none of them. It answered with a plausible wrong figure, which is
 * the one thing every other rule in this layer refuses.
 *
 * Re-reading costs little and is safe: `read-local-cost-use-case.ts` dedupes per `turn_id`
 * and appends only what is missing, so the session-level gate was a second filter at the
 * wrong granularity.
 *
 * The period bound is what keeps the cost from growing with the age of the project: without
 * it a report over one week would re-read every session a repository has ever journalled. */
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
