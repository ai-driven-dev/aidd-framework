import type { VersionControl } from "../../../contexts/telemetry/domain/ports/version-control.js";
import { describeError } from "../../../kernel/describe-error.js";
import type { VersionReader } from "../../../kernel/ports/version-reader.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../kernel/tool.js";
import { getAiToolConfig, resolvePluginsCapability } from "../../tools/domain/registry.js";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  SESSION_TRAILER_TOKEN,
} from "../domain/formats/commit-session-trailer.js";
import type { HookTrustReader } from "../domain/ports/hook-trust-reader.js";
import type { HostPluginRegistryReader } from "../domain/ports/host-plugin-registry-reader.js";
import type { InstalledPluginsReader } from "../domain/ports/installed-plugins-reader.js";
import type { PersonIdentityStore } from "../domain/ports/person-identity-store.js";
import type { RunJournal, RunJournalReader } from "../domain/ports/run-journal-reader.js";
import type { SessionCostReader } from "../domain/ports/session-cost-reader.js";
import type { TelemetryEvidenceReader } from "../domain/ports/telemetry-evidence-reader.js";
import type { TelemetrySink } from "../domain/ports/telemetry-sink.js";
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
  buildHostRegistration,
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

/** How far back the trailer count looks. Twenty rather than a date: the cost is the same on
 * any repository, and it is enough that a person measuring for a week sees whether their
 * commits are being stamped without the answer drowning in history from before they were. */
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

/** The plugin version the hook itself stamped, taken from the most recently opened session
 * that carries one.
 *
 * The most recent, not the first: a plugin upgraded mid-period leaves older lines naming
 * the older build, and what a person asking "which version is running" wants is the one
 * running now. Sessions that carry none are skipped rather than counted as an absence — one
 * line written before the field existed must not hide a later line that has it.
 */
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
 * Gathers every claim's evidence from the one route this system reads, then hands it to
 * the pure judge in `domain/telemetry-claim.ts`. Never writes anywhere — unlike
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
    private readonly telemetrySink: TelemetrySink,
    private readonly currentVersion: VersionReader,
    private readonly installedPlugins: InstalledPluginsReader,
    private readonly hostRegistries: ReadonlyMap<AiToolId, HostPluginRegistryReader>
  ) {}

  async execute(options: DiagnoseTelemetryOptions): Promise<DiagnoseTelemetryResult> {
    // Gathered before the gate, and regardless of it: a stale export in a tool's own
    // settings file exports whether or not this project's own switch is on, so a person
    // whose switch is off must still be told about it. `setup` follows the same rule —
    // what is in place is exactly what a person switched off still needs to see.
    // Read once and passed down: `gatherSetup` needs it for the plugin version, and a
    // gated run stops before `gatherEvidence` would ever ask for it again.
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

  /** Every plugin AIDD's own manifest records, against what each host's registry says.
   *
   * Driven from the manifest and never from a settings file: `mergeEnabledPlugins` skips a
   * plugin silently when it records no marketplace or when that marketplace does not
   * resolve, so a settings-first comparison would find both sides absent and read it as
   * agreement while the plugin never loads.
   *
   * A tool with no reader in the map contributes its plugins with no reading at all, which
   * `buildHostRegistration` turns into `unanswerable` — never into agreement. A manifest
   * that cannot be loaded contributes nothing, the same normal state as a project with no
   * plugins installed. */
  private async readHostRegistration(projectRoot: string): Promise<TelemetryHostRegistrationSetup> {
    let recorded: Awaited<ReturnType<InstalledPluginsReader["read"]>>;
    try {
      recorded = await this.installedPlugins.read();
    } catch (error) {
      // `Manifest`'s parser maps over fields it does not guard, so a damaged manifest throws
      // rather than returning null. Reported, never swallowed and never fatal: this is the
      // command a person runs precisely when something is wrong.
      // Names the file, because the row directly above says `recorder declared: yes` about
      // the same one: that row scans the raw JSON for a declaration while this goes through
      // the manifest's own validation, so a file that parses but fails validation makes the
      // two rows disagree. Naming it is what tells a person they are one file, read twice.
      return {
        ...buildHostRegistration([]),
        manifestUnreadable: `${this.installedPlugins.path} — ${describeError(error)}`,
      };
    }
    if (recorded === null) return buildHostRegistration([]);
    const evidence = await Promise.all(
      // Filtered before the read, never after: a tool with no plugin recorded contributes no
      // entry, so opening its registry would be a home-directory read whose result is thrown
      // away on every `check`.
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

  // A reader's own contract promises never to throw, and this catches anyway — a
  // diagnostic that crashed on the one tool whose file is unreadable would answer nothing
  // about every other claim it could still judge.
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
