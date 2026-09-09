import type { GitignoreUseCase } from "../../contexts/framework/application/gitignore-use-case.js";
import type { ManifestRepository } from "../../contexts/framework/domain/ports/manifest-repository.js";
import { DiagnoseTelemetryUseCase } from "../../contexts/telemetry/application/diagnose-telemetry-use-case.js";
import { ForgetTelemetryUseCase } from "../../contexts/telemetry/application/forget-telemetry-use-case.js";
import { PersonIdentityUseCase } from "../../contexts/telemetry/application/person-identity-use-case.js";
import { ReadLocalCostUseCase } from "../../contexts/telemetry/application/read-local-cost-use-case.js";
import { ReportCostUseCase } from "../../contexts/telemetry/application/report-cost-use-case.js";
import { TelemetryOffUseCase } from "../../contexts/telemetry/application/telemetry-off-use-case.js";
import { TelemetryOnUseCase } from "../../contexts/telemetry/application/telemetry-on-use-case.js";
import { createClaudeCodeTranscriptAccumulator } from "../../contexts/telemetry/domain/formats/claude-code-transcript.js";
import { createCodexRolloutAccumulator } from "../../contexts/telemetry/domain/formats/codex-rollout.js";
import type { SessionCostReader } from "../../contexts/telemetry/domain/ports/session-cost-reader.js";
import type { TelemetrySink } from "../../contexts/telemetry/domain/ports/telemetry-sink.js";
import type { VersionControl } from "../../contexts/telemetry/domain/ports/version-control.js";
import { CopilotCostReaderAdapter } from "../../contexts/telemetry/infrastructure/copilot-cost-reader-adapter.js";
import { HookTrustReaderAdapter } from "../../contexts/telemetry/infrastructure/hook-trust-reader-adapter.js";
import { OpencodeCostReaderAdapter } from "../../contexts/telemetry/infrastructure/opencode-cost-reader-adapter.js";
import { PersonIdentityAdapter } from "../../contexts/telemetry/infrastructure/person-identity-adapter.js";
import { RunJournalReaderAdapter } from "../../contexts/telemetry/infrastructure/run-journal-reader-adapter.js";
import { TaskBacklogAdapter } from "../../contexts/telemetry/infrastructure/task-backlog-adapter.js";
import { TelemetryEvidenceAdapter } from "../../contexts/telemetry/infrastructure/telemetry-evidence-adapter.js";
import { TelemetrySinkAdapter } from "../../contexts/telemetry/infrastructure/telemetry-sink-adapter.js";
import { TranscriptCostReaderAdapter } from "../../contexts/telemetry/infrastructure/transcript-cost-reader-adapter.js";
import { CLAUDE_CODE_TRANSCRIPT_LOCATION } from "../../contexts/tools/domain/profiles/claude/claude-transcript-location.js";
import { CODEX_ROLLOUT_LOCATION } from "../../contexts/tools/domain/profiles/codex/codex-transcript-location.js";
import { hostPluginRegistryReaders } from "../../contexts/tools/infrastructure/host-plugin-registry-reader-adapter.js";
import type { FileReader } from "../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../kernel/ports/file-writer.js";
import type { Logger } from "../../kernel/ports/logger.js";
import type { VersionReader } from "../../kernel/ports/version-reader.js";
import { resolveHomeDir } from "../../kernel/reading/home-dir.js";
import type { AiToolId } from "../../kernel/tool.js";
import { installedPluginsFromManifest } from "./installed-plugins-from-manifest.js";

export interface TelemetryWiringShared {
  fs: FileReader & FileWriter;
  logger: Logger;
  git: VersionControl;
  projectRoot: string;
  gitignoreUseCase: GitignoreUseCase;
  currentVersionProvider: VersionReader;
  manifestRepo: ManifestRepository;
}

export interface TelemetryDeps {
  telemetrySink: TelemetrySink;
  telemetryOnUseCase: TelemetryOnUseCase;
  telemetryOffUseCase: TelemetryOffUseCase;
  readLocalCostUseCase: ReadLocalCostUseCase;
  personIdentityUseCase: PersonIdentityUseCase;
  diagnoseTelemetryUseCase: DiagnoseTelemetryUseCase;
  reportCostUseCase: ReportCostUseCase;
  forgetTelemetryUseCase: ForgetTelemetryUseCase;
}

/** Tool identifiers appear here because a profile cannot name the adapter that reads it
 * without putting infrastructure in the domain. `resolveHomeDir()` rather than a bare
 * `homedir()`: on Windows the bare call ignores a `HOME` a person or a test sandbox set. */
export function wireTelemetry(shared: TelemetryWiringShared): TelemetryDeps {
  const { fs, logger, git, projectRoot, gitignoreUseCase, currentVersionProvider, manifestRepo } =
    shared;
  const telemetryEvidence = new TelemetryEvidenceAdapter();
  const telemetrySink = new TelemetrySinkAdapter();
  const runJournalReader = new RunJournalReaderAdapter(projectRoot);
  const personIdentity = new PersonIdentityAdapter();

  // The one place allowed to map a tool that declares `telemetryLocalRead: { kind:
  // "declared" }` to the adapter that reads it.
  const localCostReaders: ReadonlyMap<AiToolId, SessionCostReader> = new Map<
    AiToolId,
    SessionCostReader
  >([
    ["opencode", new OpencodeCostReaderAdapter()],
    [
      "claude",
      new TranscriptCostReaderAdapter(
        resolveHomeDir(),
        CLAUDE_CODE_TRANSCRIPT_LOCATION,
        createClaudeCodeTranscriptAccumulator
      ),
    ],
    [
      "codex",
      new TranscriptCostReaderAdapter(
        resolveHomeDir(),
        CODEX_ROLLOUT_LOCATION,
        createCodexRolloutAccumulator
      ),
    ],
    ["copilot", new CopilotCostReaderAdapter(resolveHomeDir())],
  ]);

  const readLocalCostUseCase = new ReadLocalCostUseCase(
    telemetrySink,
    localCostReaders,
    runJournalReader,
    personIdentity,
    telemetryEvidence,
    currentVersionProvider,
    logger
  );

  return {
    telemetrySink,
    telemetryOnUseCase: new TelemetryOnUseCase(fs, logger, gitignoreUseCase, git, telemetrySink),
    telemetryOffUseCase: new TelemetryOffUseCase(fs, logger, telemetryEvidence, git),
    readLocalCostUseCase,
    personIdentityUseCase: new PersonIdentityUseCase(personIdentity),
    diagnoseTelemetryUseCase: new DiagnoseTelemetryUseCase(
      telemetryEvidence,
      git,
      runJournalReader,
      localCostReaders,
      new HookTrustReaderAdapter(),
      personIdentity,
      telemetrySink,
      currentVersionProvider,
      installedPluginsFromManifest(manifestRepo),
      hostPluginRegistryReaders()
    ),
    reportCostUseCase: new ReportCostUseCase(
      telemetrySink,
      runJournalReader,
      personIdentity,
      telemetryEvidence,
      new TaskBacklogAdapter(projectRoot),
      logger,
      readLocalCostUseCase
    ),
    forgetTelemetryUseCase: new ForgetTelemetryUseCase(
      telemetrySink,
      runJournalReader,
      personIdentity,
      git
    ),
  };
}
