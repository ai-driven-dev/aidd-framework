import { resolveSessionAnchor } from "../../../domain/models/session-anchor.js";
import { attributeMoment, buildStepIntervals } from "../../../domain/models/step-attribution.js";
import {
  diagnoseTelemetryClaims,
  type TelemetryClaim,
  type TelemetryClaimJournal,
  type TelemetryClaimToolRead,
  type TelemetryCodexHookTrust,
  type TelemetryEvidence,
} from "../../../domain/models/telemetry-claim.js";
import type { TelemetryExportLeftover } from "../../../domain/models/telemetry-export-leftover.js";
import {
  buildTelemetryAllowedSetup,
  type TelemetryIdentitySetup,
  type TelemetrySetup,
} from "../../../domain/models/telemetry-setup.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../domain/models/tool-ids.js";
import type { HookTrustReader } from "../../../domain/ports/hook-trust-reader.js";
import type { PersonIdentityStore } from "../../../domain/ports/person-identity-store.js";
import type { RunJournal, RunJournalReader } from "../../../domain/ports/run-journal-reader.js";
import type { SessionCostReader } from "../../../domain/ports/session-cost-reader.js";
import type { TelemetryEvidenceReader } from "../../../domain/ports/telemetry-evidence-reader.js";
import type { TelemetrySink } from "../../../domain/ports/telemetry-sink.js";
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
 * absent evidence from ever producing an `ok`. `leftoverExportConfig` is neither a claim
 * nor gated by one: a stale export lives in a tool's own settings file, independent of
 * whether the local switch is on, so it is gathered and reported either way. `setup` is
 * gathered the same way, on both sides of the gate: what is in place is exactly what a
 * person switched off still needs to see, never reduced to the one-line gate message
 * alone. */
export type DiagnoseTelemetryResult =
  | {
      readonly gate: string;
      readonly setup: TelemetrySetup;
      readonly leftoverExportConfig: readonly TelemetryExportLeftover[];
    }
  | {
      readonly gate?: undefined;
      readonly setup: TelemetrySetup;
      readonly claims: readonly TelemetryClaim[];
      readonly uncovered: readonly DiagnoseTelemetryUncoveredTool[];
      readonly leftoverExportConfig: readonly TelemetryExportLeftover[];
    };

export interface DiagnoseTelemetryOptions {
  readonly projectRoot: string;
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
 * Gathers every claim's evidence from the one route this system reads, then hands it to
 * the pure judge in `domain/models/telemetry-claim.ts`. Never writes anywhere — unlike
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
    private readonly personIdentityStore: PersonIdentityStore,
    private readonly telemetrySink: TelemetrySink
  ) {}

  async execute(options: DiagnoseTelemetryOptions): Promise<DiagnoseTelemetryResult> {
    // Gathered before the gate, and regardless of it: a stale export in a tool's own
    // settings file exports whether or not this project's own switch is on, so a person
    // whose switch is off must still be told about it. `setup` follows the same rule —
    // what is in place is exactly what a person switched off still needs to see.
    const leftoverExportConfig = await this.evidence.findLeftoverExportConfig(options.projectRoot);
    const setup = await this.gatherSetup(options);
    const gate = await this.gateReason(options);
    if (gate !== null) return { gate, setup, leftoverExportConfig };
    const evidence = await this.gatherEvidence(options, setup.recorderDeclaration.declared);
    const claims = diagnoseTelemetryClaims(evidence);
    return { setup, claims, uncovered: uncoveredTools(), leftoverExportConfig };
  }

  private async gatherSetup(options: DiagnoseTelemetryOptions): Promise<TelemetrySetup> {
    const [switchSetup, recorderDeclaration] = await Promise.all([
      this.evidence.readSwitchSetup(options.projectRoot),
      this.evidence.readRecorderDeclaration(options.projectRoot),
    ]);
    return {
      allowed: buildTelemetryAllowedSetup(switchSetup, options.env),
      identity: await this.readIdentitySetup(),
      recordsLocation: { path: this.telemetrySink.rootDir },
      recorderDeclaration,
    };
  }

  // `PersonIdentityStore.readStrict()` promises to throw on a damaged file, unlike the
  // plain `read()` every other identity consumer uses — this is the one caller that must
  // tell "nobody chose" apart from "could not be read", so it catches rather than letting
  // one damaged file cost every other stated fact its own answer.
  private async readIdentitySetup(): Promise<TelemetryIdentitySetup> {
    const path = this.personIdentityStore.filePath;
    try {
      const identity = await this.personIdentityStore.readStrict();
      return { attached: identity !== null, path, readable: true };
    } catch {
      return { attached: false, path, readable: false };
    }
  }

  private async gatherEvidence(
    options: DiagnoseTelemetryOptions,
    recorderDeclared: boolean
  ): Promise<TelemetryEvidence> {
    const journals = await this.runJournalReader.list();
    const currentSessionId = resolveSessionAnchor(options.env);
    const unrecognisedPayload = await this.evidence.readUnrecognisedPayload(options.projectRoot);
    const hookTrust = await this.resolveHookTrust(options.env, currentSessionId);
    const toolReads = await this.gatherToolReads(journals);
    return {
      journals: journals.map(toClaimJournal),
      toolReads,
      runsDirLabel: DEFAULT_RUNS_DIR_LABEL,
      currentSessionId,
      unrecognisedPayloadAt: unrecognisedPayload?.at,
      hookTrust,
      recorderDeclared,
    };
  }

  // Stops the run before any claim is evaluated: neither fact is evidence about the hook,
  // both are facts about whether there is anything here for it to have written.
  private async gateReason(options: DiagnoseTelemetryOptions): Promise<string | null> {
    if (!(await this.evidence.isTelemetryEnabled(options.projectRoot, options.env))) {
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
