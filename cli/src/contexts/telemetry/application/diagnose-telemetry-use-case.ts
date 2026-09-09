import { describeError } from "../../../kernel/describe-error.js";
import type { VersionReader } from "../../../kernel/ports/version-reader.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../kernel/tool.js";
import { buildHostRegistration } from "../../tools/domain/host-plugin-registration.js";
import type { HostPluginRegistryReader } from "../../tools/domain/ports/host-plugin-registry-reader.js";
import { getAiToolConfig, resolvePluginsCapability } from "../../tools/domain/registry.js";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  SESSION_TRAILER_TOKEN,
} from "../domain/formats/commit-session-trailer.js";
import type { HookTrustReader } from "../domain/ports/hook-trust-reader.js";
import type { InstalledPluginsReader } from "../domain/ports/installed-plugins-reader.js";
import type { PersonIdentityStore } from "../domain/ports/person-identity-store.js";
import type { RunJournal, RunJournalReader } from "../domain/ports/run-journal-reader.js";
import type { SessionCostReader } from "../domain/ports/session-cost-reader.js";
import type { TelemetryEvidenceReader } from "../domain/ports/telemetry-evidence-reader.js";
import type { TelemetrySink } from "../domain/ports/telemetry-sink.js";
import type { VersionControl } from "../domain/ports/version-control.js";
import { resolveSessionAnchor } from "../domain/session-anchor.js";
import {
  attributeMoment,
  buildStepIntervals,
  type StepAttributionSource,
} from "../domain/step-attribution.js";
import {
  diagnoseTelemetryClaims,
  type TelemetryClaim,
  type TelemetryClaimJournal,
  type TelemetryClaimToolRead,
  type TelemetryCodexHookTrust,
  type TelemetryEvidence,
} from "../domain/telemetry-claim.js";
import type { TelemetryExportLeftover } from "../domain/telemetry-export-leftover.js";
import {
  buildTelemetryAllowedSetup,
  type TelemetryHostRegistrationSetup,
  type TelemetryIdentitySetup,
  type TelemetryPluginVersionSetup,
  type TelemetryRecorderDeclarationSetup,
  type TelemetrySetup,
} from "../domain/telemetry-setup.js";

const DEFAULT_RUNS_DIR_LABEL = "aidd_docs/runs";

export interface DiagnoseTelemetryUncoveredTool {
  readonly tool: AiToolId;
  readonly reason: string;
}

/** What `aidd telemetry check` answers with. `gate` is mutually exclusive with `claims`: a gated
 * run judges nothing. `leftoverExportConfig` and `setup` are gathered either side of the gate — a
 * stale export lives in a tool's own settings file, whatever this project's switch says. */
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

/** How far back the trailer count looks. A count rather than a date: the cost is the same on any
 * repository, and enough to show whether recent commits are being stamped. */
const COMMITS_EXAMINED_FOR_TRAILER = 20;

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

/** The plugin version the hook stamped, from the most recently opened session carrying one: an
 * upgrade mid-period leaves older lines naming the older build. A session carrying none is
 * skipped, never counted as an absence. */
function pluginVersionFrom(journals: readonly RunJournal[]): TelemetryPluginVersionSetup {
  const sessions = journals.map((journal) => journal.session).filter(isPresent);
  if (sessions.length === 0) return { kind: "nothing-journalled" };
  const withVersion = sessions
    .filter((session) => session.plugin_version !== undefined)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const newest = withVersion[0];
  return newest?.plugin_version === undefined
    ? { kind: "unrecorded" }
    : { kind: "recorded", version: newest.plugin_version };
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/**
 * Gathers every claim's evidence, then hands it to the pure judge in `domain/telemetry-claim.ts`.
 * Never writes: the question is only ever "would a read of this session's figures work".
 */
export class DiagnoseTelemetryUseCase {
  constructor(
    private readonly evidence: TelemetryEvidenceReader,
    private readonly git: VersionControl,
    private readonly runJournalReader: RunJournalReader,
    private readonly readers: ReadonlyMap<AiToolId, SessionCostReader>,
    private readonly hookTrustReader: HookTrustReader,
    private readonly personIdentityStore: PersonIdentityStore,
    private readonly telemetrySink: TelemetrySink,
    private readonly currentVersion: VersionReader,
    private readonly installedPlugins: InstalledPluginsReader,
    private readonly hostRegistries: ReadonlyMap<AiToolId, HostPluginRegistryReader>
  ) {}

  async execute(options: DiagnoseTelemetryOptions): Promise<DiagnoseTelemetryResult> {
    // Gathered before the gate and regardless of it: a stale export exports whether or not this
    // project's switch is on, and setup is what a person switched off still needs to see.
    const journals = await this.runJournalReader.list();
    const leftoverExportConfig = await this.evidence.findLeftoverExportConfig(options.projectRoot);
    const setup = await this.gatherSetup(options, journals);
    const gate = await this.gateReason(options);
    if (gate !== null) return { gate, setup, leftoverExportConfig };
    const evidence = await this.gatherEvidence(options, setup.recorderDeclaration, journals);
    const claims = diagnoseTelemetryClaims(evidence);
    return { setup, claims, uncovered: uncoveredTools(), leftoverExportConfig };
  }

  private async gatherSetup(
    options: DiagnoseTelemetryOptions,
    journals: readonly RunJournal[]
  ): Promise<TelemetrySetup> {
    const [switchSetup, recorderDeclaration] = await Promise.all([
      this.evidence.readSwitchSetup(options.projectRoot),
      this.evidence.readRecorderDeclaration(options.projectRoot),
    ]);
    return {
      allowed: buildTelemetryAllowedSetup(switchSetup, options.env),
      identity: await this.readIdentitySetup(),
      recordsLocation: { path: this.telemetrySink.rootDir },
      recorderDeclaration,
      hostRegistration: await this.readHostRegistration(options.projectRoot),
      commitTrailer: await this.git.readCommitTrailerSetup(
        options.projectRoot,
        SESSION_TRAILER_DELEGATE_FILE,
        SESSION_TRAILER_TOKEN,
        COMMITS_EXAMINED_FOR_TRAILER
      ),
      versions: {
        cli: this.currentVersion.get(),
        plugin: pluginVersionFrom(journals),
      },
    };
  }

  /** Every plugin the manifest records, against what each host's registry says. Driven from the
   * manifest, never from a settings file: a plugin whose marketplace does not resolve is skipped
   * silently there, so a settings-first comparison would read absence as agreement. */
  private async readHostRegistration(projectRoot: string): Promise<TelemetryHostRegistrationSetup> {
    let recorded: Awaited<ReturnType<InstalledPluginsReader["read"]>>;
    try {
      recorded = await this.installedPlugins.read();
    } catch (error) {
      // A damaged manifest throws rather than returning null: reported, never fatal, and named —
      // the `recorder declared` row scans the same file's raw JSON while this goes through the
      // manifest's own validation, so the two rows can disagree about one file.
      return {
        ...buildHostRegistration([]),
        manifestUnreadable: `${this.installedPlugins.path} — ${describeError(error)}`,
      };
    }
    if (recorded === null) return buildHostRegistration([]);
    const evidence = await Promise.all(
      // Filtered before the read, never after: a tool with no plugin recorded would otherwise pay
      // a home-directory read whose result is thrown away on every `check`.
      AI_TOOL_IDS.filter((tool) => (recorded.get(tool) ?? []).length > 0).map(async (tool) => ({
        tool,
        plugins: (recorded.get(tool) ?? []).map((plugin) => ({
          name: plugin.name,
          marketplace: plugin.marketplace,
        })),
        reading: await this.hostRegistries.get(tool)?.read(projectRoot),
        declaresNativeActivation: resolvePluginsCapability(tool)?.nativeActivation != null,
      }))
    );
    return buildHostRegistration(evidence);
  }

  // `readStrict()` throws on a damaged file, unlike the `read()` every other consumer uses: this
  // caller must tell "nobody chose" apart from "could not be read", so it catches.
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
    recorderDeclaration: TelemetryRecorderDeclarationSetup,
    journals: readonly RunJournal[]
  ): Promise<TelemetryEvidence> {
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
      recorderDeclared: recorderDeclaration.declared,
      recorderDeclarationReadable: recorderDeclaration.unreadable.length === 0,
      foreignSchemaVersions: await this.runJournalReader.listForeignSchemas(),
    };
  }

  // Stops the run before any claim is evaluated: neither fact is evidence about the hook,
  // both are facts about whether there is anything here for it to have written.
  private async gateReason(options: DiagnoseTelemetryOptions): Promise<string | null> {
    if (!(await this.evidence.isTelemetryEnabled(options.projectRoot, options.env))) {
      return "measurement is off — nothing to check until it is turned on";
    }
    if (!(await this.git.isRepository(options.projectRoot))) {
      return (
        "not a git repository — the hook has nowhere to write here, not a hook that failed " +
        "to fire"
      );
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

  // A reader's contract promises never to throw, and this catches anyway: a diagnostic that
  // crashed on one unreadable file would answer nothing about every other claim.
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
): { readonly stepAttribution: StepAttributionSource } {
  if (record.step !== undefined) return { stepAttribution: "tool-stated" };
  return { stepAttribution: attributeMoment(intervals, record.event_timestamp).source };
}
