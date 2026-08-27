import { resolveCurrentTool, resolveSessionAnchor } from "../../../domain/models/session-anchor.js";
import { attributeMoment, buildStepIntervals } from "../../../domain/models/step-attribution.js";
import {
  diagnoseTelemetryClaims,
  type TelemetryClaim,
  type TelemetryClaimJournal,
  type TelemetryClaimToolRead,
  type TelemetryCodexHookTrust,
  type TelemetryEvidence,
  type TelemetryExportConfigEvidence,
  type TelemetryExportedRecordEvidence,
} from "../../../domain/models/telemetry-claim.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../domain/models/tool-ids.js";
import type { ExportConfigReader } from "../../../domain/ports/export-config-reader.js";
import type { ExportSinkReader } from "../../../domain/ports/export-sink-reader.js";
import type { HookTrustReader } from "../../../domain/ports/hook-trust-reader.js";
import type { RunJournal, RunJournalReader } from "../../../domain/ports/run-journal-reader.js";
import type { SessionCostReader } from "../../../domain/ports/session-cost-reader.js";
import type { TelemetryEvidenceReader } from "../../../domain/ports/telemetry-evidence-reader.js";
import type { VersionControl } from "../../../domain/ports/version-control.js";
import { getAiToolConfig } from "../../../domain/tools/registry.js";

const DEFAULT_RUNS_DIR_LABEL = "aidd_docs/runs";

export interface DiagnoseTelemetryUncoveredTool {
  readonly tool: AiToolId;
  readonly reason: string;
}

/** What `aidd telemetry check` answers with. `gate`, when present, is a reason the run
 * stopped before judging any claim at all — measurement off, or no repository — and is
 * mutually exclusive with `claims`: a gated run judges nothing, the same rule that keeps
 * absent evidence from ever producing an `ok`. */
export type DiagnoseTelemetryResult =
  | { readonly gate: string }
  | {
      readonly gate?: undefined;
      readonly claims: readonly TelemetryClaim[];
      readonly uncovered: readonly DiagnoseTelemetryUncoveredTool[];
    };

export interface DiagnoseTelemetryOptions {
  readonly projectRoot: string;
  readonly homeDir: string;
  readonly env: NodeJS.ProcessEnv;
}

function toClaimJournal(journal: RunJournal): TelemetryClaimJournal {
  return {
    vendorId: journal.session?.vendor_id,
    sessionStartAt: journal.session?.at,
    turnClosed: journal.boundaries.length > 0,
  };
}

function isCovered(tool: AiToolId): boolean {
  return getAiToolConfig(tool).telemetryLocalRead.kind === "declared";
}

function coveredTools(): readonly AiToolId[] {
  return AI_TOOL_IDS.filter(isCovered);
}

function uncoveredTools(): readonly DiagnoseTelemetryUncoveredTool[] {
  return AI_TOOL_IDS.filter((tool) => !isCovered(tool)).map((tool) => {
    const localRead = getAiToolConfig(tool).telemetryLocalRead;
    return {
      tool,
      reason: localRead.kind === "unsupported" ? localRead.reason : "no reader wired yet",
    };
  });
}

/**
 * Gathers every claim's evidence, local and export alike, then hands it to the pure judge
 * in `domain/models/telemetry-claim.ts`. Never writes anywhere — unlike
 * `ReadLocalCostUseCase`, this never stores a record, since the question is only ever
 * "would a read of this session's figures work", not "read them".
 */
export class DiagnoseTelemetryUseCase {
  constructor(
    private readonly evidence: TelemetryEvidenceReader,
    private readonly git: VersionControl,
    private readonly runJournalReader: RunJournalReader,
    private readonly readers: ReadonlyMap<AiToolId, SessionCostReader>,
    private readonly hookTrustReader: HookTrustReader,
    private readonly exportConfigReader: ExportConfigReader,
    private readonly exportSinkReader: ExportSinkReader
  ) {}

  async execute(options: DiagnoseTelemetryOptions): Promise<DiagnoseTelemetryResult> {
    const gate = await this.gateReason(options);
    if (gate !== null) return { gate };
    const claims = diagnoseTelemetryClaims(await this.gatherEvidence(options));
    return { claims, uncovered: uncoveredTools() };
  }

  private async gatherEvidence(options: DiagnoseTelemetryOptions): Promise<TelemetryEvidence> {
    const journals = await this.runJournalReader.list();
    const currentSessionId = resolveSessionAnchor(options.env);
    const unrecognisedPayload = await this.evidence.readUnrecognisedPayload(options.projectRoot);
    const hookTrust = await this.resolveHookTrust(options.env, currentSessionId);
    const toolReads = await this.gatherToolReads(journals);
    const { exportConfig, exportedRecord } = await this.gatherExportEvidence(
      options,
      currentSessionId
    );
    return {
      journals: journals.map(toClaimJournal),
      toolReads,
      runsDirLabel: DEFAULT_RUNS_DIR_LABEL,
      currentSessionId,
      unrecognisedPayloadAt: unrecognisedPayload?.at,
      hookTrust,
      exportConfig,
      exportedRecord,
    };
  }

  // Stops the run before any claim is evaluated: neither fact is evidence about the hook,
  // both are facts about whether there is anything here for it to have written.
  private async gateReason(options: DiagnoseTelemetryOptions): Promise<string | null> {
    if (!(await this.evidence.isTelemetryEnabled(options.projectRoot))) {
      return "measurement is off — nothing to check until it is turned on";
    }
    if (!(await this.git.isRepository(options.projectRoot))) {
      return "not a git repository — the hook has nowhere to write here, not a hook that failed to fire";
    }
    return null;
  }

  // Only Codex gates a hook behind a trust grant it can decline in silence: a session
  // running under any other tool has nothing to read here, and asks nothing of it.
  private async resolveHookTrust(
    env: NodeJS.ProcessEnv,
    currentSessionId: string | undefined
  ): Promise<TelemetryCodexHookTrust | undefined> {
    if (env.CODEX_THREAD_ID === undefined || currentSessionId === undefined) return undefined;
    return this.hookTrustReader.read();
  }

  // Read fresh, from the export route, never from the local route's own journals/toolReads
  // above: resolved from the same two anchor variables `resolveSessionAnchor` already
  // probes for `currentSessionId`, but naming which tool rather than which session, since
  // the export-config reader reads settings per tool, not per session.
  private async gatherExportEvidence(
    options: DiagnoseTelemetryOptions,
    currentSessionId: string | undefined
  ): Promise<{
    exportConfig: TelemetryExportConfigEvidence | null;
    exportedRecord: TelemetryExportedRecordEvidence | undefined;
  }> {
    const currentTool = resolveCurrentTool(options.env);
    const exportConfig = await this.exportConfigReader.read(
      currentTool,
      options.projectRoot,
      options.homeDir
    );
    const record =
      currentSessionId === undefined
        ? undefined
        : await this.exportSinkReader.findExportedRecordForSession(currentSessionId);
    return { exportConfig, exportedRecord: record && { vendorField: record.vendor_field } };
  }

  private async gatherToolReads(
    journals: readonly RunJournal[]
  ): Promise<readonly TelemetryClaimToolRead[]> {
    const covered = coveredTools();
    const reads: TelemetryClaimToolRead[] = [];
    for (const journal of journals) {
      const sessionId = journal.session?.vendor_id;
      if (sessionId === undefined) continue;
      const intervals = buildStepIntervals(journal);
      for (const tool of covered) {
        reads.push(await this.readOneTool(tool, sessionId, intervals));
      }
    }
    return reads;
  }

  // Mirrors telemetry-check.cjs's own `readTool`: a reader's own contract promises never
  // to throw, and this catches anyway — a diagnostic that crashed on the one tool whose
  // file is unreadable would answer nothing about every other claim it could still judge.
  private async readOneTool(
    tool: AiToolId,
    sessionId: string,
    intervals: ReturnType<typeof buildStepIntervals>
  ): Promise<TelemetryClaimToolRead> {
    const reader = this.readers.get(tool);
    const hasIntervals = intervals.length > 0;
    if (!reader) return { tool, sessionFound: false, hasIntervals, records: [] };
    try {
      const result = await reader.read(sessionId);
      const records = result.records.map((record) => stampAttribution(record, intervals));
      return { tool, sessionFound: result.sessionFound, hasIntervals, records };
    } catch (error) {
      return {
        tool,
        sessionFound: false,
        hasIntervals,
        records: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function stampAttribution(
  record: { readonly step?: string; readonly event_timestamp?: string },
  intervals: ReturnType<typeof buildStepIntervals>
): { readonly stepAttribution: "tool-stated" | "journal-interval" | "unattributed" } {
  if (record.step !== undefined) return { stepAttribution: "tool-stated" };
  return { stepAttribution: attributeMoment(intervals, record.event_timestamp).source };
}
