import { UserScopeUnavailableError } from "../../../kernel/errors.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type { VersionReader } from "../../../kernel/ports/version-reader.js";
import type { AiToolId, IdeToolId } from "../../../kernel/tool.js";
import type { SetupPluginsPromptUseCase } from "../../../presentation/prompts/setup-plugins-prompt-use-case.js";
import type { SetupToolsPromptUseCase } from "../../../presentation/prompts/setup-tools-prompt-use-case.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";
import type { ProjectContext } from "../domain/project-context.js";
import type { SetupFlow } from "../domain/setup-flow.js";
import type {
  MarketplaceSyncSettings,
  MarketplaceSyncSettingsResult,
} from "./flows/marketplace-sync-settings-use-case.js";
import { InitUseCase } from "./init-use-case.js";
import type { ProjectContextDetectorUseCase } from "./setup/project-context-detector-use-case.js";
import type { SetupMachineScopeUseCase } from "./setup/setup-machine-scope-use-case.js";
import type { SetupToolsResult, SetupToolsUseCase } from "./setup/setup-tools-use-case.js";
import type { SetupMarketplaceRegistrationUseCase } from "./shared/setup-marketplace-registration-use-case.js";

export type SetupResult =
  | {
      kind: "initialized";
      install: SetupToolsResult;
      activation: MarketplaceSyncSettingsResult;
      context?: ProjectContext;
    }
  | {
      kind: "up-to-date";
      install: SetupToolsResult;
      activation: MarketplaceSyncSettingsResult;
      context?: ProjectContext;
    };

export class SetupUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly manifestRepo: ManifestRepository,
    private readonly setupMarketplaceRegistration: SetupMarketplaceRegistrationUseCase,
    private readonly marketplaceSyncSettingsUseCase: MarketplaceSyncSettings,
    private readonly setupToolsUseCase: SetupToolsUseCase,
    private readonly setupPluginsPromptUseCase: SetupPluginsPromptUseCase,
    private readonly currentVersionProvider: VersionReader,
    private readonly setupToolsPromptUseCase?: SetupToolsPromptUseCase,
    private readonly projectContextDetector?: ProjectContextDetectorUseCase,
    /** Handles `flow.scope === "user"` entirely. Absent, `execute` refuses a request it has
     * nothing to serve. */
    private readonly setupMachineScopeUseCase?: SetupMachineScopeUseCase
  ) {}

  async execute(flow: SetupFlow): Promise<SetupResult> {
    if (flow.scope === "user") return this.runMachineScope(flow);
    const context = await this.detectContext(flow);
    // Resolved before initManifest: a non-interactive run with no --source must reject
    // before it ever writes .aidd/manifest.json or touches .gitignore, not after.
    const source = await this.setupMarketplaceRegistration.resolveSourceIfNeeded(flow);
    const isNew = await this.initManifest(flow);
    await this.setupMarketplaceRegistration.registerIfPresent(flow, source);
    const install = await this.installTools(flow, context);
    if (flow.registerDefaultMarketplace) await this.promptPlugins(flow);
    const activation = await this.syncSettings(flow);
    return this.buildResult(isNew, install, activation, context);
  }

  private async runMachineScope(flow: SetupFlow): Promise<SetupResult> {
    if (this.setupMachineScopeUseCase === undefined) {
      throw new UserScopeUnavailableError();
    }
    return this.setupMachineScopeUseCase.execute(flow);
  }

  private async detectContext(flow: SetupFlow): Promise<ProjectContext | undefined> {
    if (this.projectContextDetector === undefined) return undefined;
    return this.projectContextDetector.execute({ projectRoot: flow.projectRoot });
  }

  private async syncSettings(flow: SetupFlow): Promise<MarketplaceSyncSettingsResult> {
    return this.marketplaceSyncSettingsUseCase.execute({ projectRoot: flow.projectRoot });
  }

  private async initManifest(flow: SetupFlow): Promise<boolean> {
    const existing = await this.manifestRepo.load();
    if (existing !== null) return false;
    await new InitUseCase(this.fs, this.manifestRepo).execute({
      projectRoot: flow.projectRoot,
      force: false,
    });
    return true;
  }

  private async installTools(
    flow: SetupFlow,
    context: ProjectContext | undefined
  ): Promise<SetupToolsResult> {
    const { aiTools, ideTools } = await this.resolveTools(flow, context);
    const version = this.currentVersionProvider.get();
    return this.setupToolsUseCase.execute({
      projectRoot: flow.projectRoot,
      aiTools,
      ideTools,
      force: flow.force,
      version,
    });
  }

  private async resolveTools(
    flow: SetupFlow,
    context: ProjectContext | undefined
  ): Promise<{ aiTools: readonly AiToolId[]; ideTools: readonly IdeToolId[] }> {
    if (this.setupToolsPromptUseCase === undefined) {
      return { aiTools: flow.aiTools as AiToolId[], ideTools: flow.ideTools as IdeToolId[] };
    }
    return this.setupToolsPromptUseCase.execute({
      interactive: flow.interactive,
      aiTools: flow.aiTools as AiToolId[],
      ideTools: flow.ideTools as IdeToolId[],
      context,
    });
  }

  private async promptPlugins(flow: SetupFlow): Promise<void> {
    await this.setupPluginsPromptUseCase.execute({
      projectRoot: flow.projectRoot,
      mode: flow.pluginMode,
      pluginNames: [...flow.pluginNames],
      interactive: flow.interactive,
    });
  }

  private buildResult(
    isNew: boolean,
    install: SetupToolsResult,
    activation: MarketplaceSyncSettingsResult,
    context: ProjectContext | undefined
  ): SetupResult {
    if (isNew) return { kind: "initialized", install, activation, context };
    return { kind: "up-to-date", install, activation, context };
  }
}
