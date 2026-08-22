import {
  buildCostReport,
  type CostReport,
  type CostReportFilters,
  type CostReportSessionJournal,
  type CostReportToolCapability,
  type CostReportToolDeclaration,
} from "../../../domain/models/cost-report.js";
import type { ResolvedReportPeriod } from "../../../domain/models/report-period.js";
import { buildTaskIntervals } from "../../../domain/models/task-attribution.js";
import type { TaskIdentity } from "../../../domain/models/task-identity.js";
import { AI_TOOL_IDS } from "../../../domain/models/tool-ids.js";
import type { RunJournal, RunJournalReader } from "../../../domain/ports/run-journal-reader.js";
import type { TelemetrySink } from "../../../domain/ports/telemetry-sink.js";
import { getAiToolConfig } from "../../../domain/tools/registry.js";

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
      export: config.telemetryExport.kind === "declared" ? config.telemetryExport.supplies : null,
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

function toSessionJournal(journal: RunJournal): CostReportSessionJournal | null {
  if (!journal.session) return null;
  return {
    vendorId: journal.session.vendor_id,
    tool: journal.session.tool,
    ...(journal.session.project_id === undefined ? {} : { projectId: journal.session.project_id }),
    writtenPaths: journal.filesWritten.map((written) => written.path),
    taskIntervals: buildTaskIntervals(journal),
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
export class ReportCostUseCase {
  constructor(
    private readonly sink: TelemetrySink,
    private readonly runJournalReader: RunJournalReader
  ) {}

  async execute(options: ReportCostOptions): Promise<CostReport> {
    const { fromDay, toDay } = options.period;
    const read = await this.sink.readRecordsInPeriod(
      new Date(`${fromDay}T00:00:00Z`),
      new Date(`${toDay}T00:00:00Z`)
    );
    // Every journal, not only the period's: a journal carries no date in its file name, and
    // the records it is joined to were already selected by their own moments. Filtering the
    // journals as well would only be a second, weaker selection over the same thing.
    const journals = await this.runJournalReader.list();

    return buildCostReport({
      fromDay,
      toDay,
      records: read.records,
      journals: journals.map(toSessionJournal).filter((journal) => journal !== null),
      declaredTools: declaredTools(),
      undatedRecords: read.undated.length,
      unreadableLines: read.skippedLines,
      ...(options.task === undefined ? {} : { task: options.task }),
      ...(options.filters === undefined ? {} : { filters: options.filters }),
      knownValues: read.knownValues,
    });
  }
}
