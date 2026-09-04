import { CatalogFetchAuthError } from "../../../kernel/errors.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type { VersionReader } from "../../../kernel/ports/version-reader.js";
import type { PluginSource } from "../../../kernel/source.js";
import type { AiToolId, IdeToolId } from "../../../kernel/tool.js";
import type { SetupPluginsPromptUseCase } from "../../../presentation/prompts/setup-plugins-prompt-use-case.js";
import type { SetupToolsPromptUseCase } from "../../../presentation/prompts/setup-tools-prompt-use-case.js";
import type { TokenProvider } from "../../../runtime/auth/ports/token-provider.js";
import type { LatestReleaseResolver } from "../../../runtime/self-update/latest-release-resolver.js";
import type {
  MarketplaceRefresh,
  MarketplaceRefreshUseCase,
} from "../../distribution/application/marketplace-refresh-use-case.js";
import type {
  MarketplaceRegisterFramework,
  MarketplaceRegisterFrameworkOptions,
  MarketplaceRegisterFrameworkUseCase,
} from "../../distribution/application/marketplace-register-framework-use-case.js";
import type { MarketplaceSourceMode } from "../../distribution/domain/marketplace-source-mode.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";
import type { ProjectContext } from "../domain/project-context.js";
import type { SetupFlow } from "../domain/setup-flow.js";
import type { MarketplaceSyncSettings } from "./flows/marketplace-sync-settings-use-case.js";
import { InitUseCase } from "./init-use-case.js";
import type { ProjectContextDetectorUseCase } from "./setup/project-context-detector-use-case.js";
import type { SetupMarketplaceSourceUseCase } from "./setup/setup-marketplace-source-use-case.js";
import type { SetupToolsResult, SetupToolsUseCase } from "./setup/setup-tools-use-case.js";

export type SetupResult =
  | { kind: "initialized"; install: SetupToolsResult; context?: ProjectContext }
  | { kind: "up-to-date"; install: SetupToolsResult; context?: ProjectContext };

export class SetupUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly manifestRepo: ManifestRepository,
    private readonly setupMarketplaceSourceUseCase: SetupMarketplaceSourceUseCase,
    private readonly marketplaceRegisterFrameworkUseCase: MarketplaceRegisterFramework,
    private readonly marketplaceRefreshUseCase: MarketplaceRefresh,
    private readonly marketplaceSyncSettingsUseCase: MarketplaceSyncSettings,
    private readonly setupToolsUseCase: SetupToolsUseCase,
    private readonly setupPluginsPromptUseCase: SetupPluginsPromptUseCase,
    private readonly currentVersionProvider: VersionReader,
    private readonly tokenProvider?: TokenProvider,
    private readonly setupToolsPromptUseCase?: SetupToolsPromptUseCase,
    private readonly projectContextDetector?: ProjectContextDetectorUseCase,
    private readonly releaseResolver?: LatestReleaseResolver
  ) {}

  async execute(flow: SetupFlow): Promise<SetupResult> {
    const context = await this.detectContext(flow);
    const isNew = await this.initManifest(flow);
    if (flow.registerDefaultMarketplace) {
      const source = await this.resolveSource(flow);
      await this.guardRemoteAuth(source);
      await this.registerMarketplace(flow, source);
      await this.refreshCatalog(flow);
    }
    const install = await this.installTools(flow, context);
    if (flow.registerDefaultMarketplace) await this.promptPlugins(flow);
    await this.syncSettings(flow);
    return this.buildResult(isNew, install, context);
  }

  private async detectContext(flow: SetupFlow): Promise<ProjectContext | undefined> {
    if (this.projectContextDetector === undefined) return undefined;
    return this.projectContextDetector.execute({ projectRoot: flow.projectRoot });
  }

  private async syncSettings(flow: SetupFlow): Promise<void> {
    await this.marketplaceSyncSettingsUseCase.execute({ projectRoot: flow.projectRoot });
  }

  private async resolveSource(flow: SetupFlow): Promise<MarketplaceSourceMode> {
    return this.setupMarketplaceSourceUseCase.execute({
      projectRoot: flow.projectRoot,
      sourceFromCli: flow.source,
      interactive: flow.interactive,
    });
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

  // Auth is only required to fetch a PRIVATE framework. A token can reach either;
  // without one, allow public repos through and gate only private/unreachable ones.
  private async guardRemoteAuth(source: MarketplaceSourceMode): Promise<void> {
    if (source.kind !== "remote") return;
    if (this.tokenProvider === undefined) return;
    const token = await this.tokenProvider.resolve();
    if (token !== null) return;
    if (
      this.releaseResolver !== undefined &&
      (await this.releaseResolver.isRepoPublic(source.repo))
    ) {
      return;
    }
    throw new CatalogFetchAuthError(`https://github.com/${source.repo}`);
  }

  private async registerMarketplace(flow: SetupFlow, source: MarketplaceSourceMode): Promise<void> {
    const opts = this.buildRegisterOptions(flow, source);
    await this.marketplaceRegisterFrameworkUseCase.execute(opts);
  }

  private buildRegisterOptions(
    flow: SetupFlow,
    source: MarketplaceSourceMode
  ): MarketplaceRegisterFrameworkOptions {
    const pluginSource = this.toPluginSource(source);
    return { projectRoot: flow.projectRoot, pluginSource, force: true };
  }

  private toPluginSource(source: MarketplaceSourceMode): PluginSource {
    if (source.kind === "local") return { kind: "local", path: source.path };
    return { kind: "github", repo: source.repo, ref: source.ref };
  }

  private async refreshCatalog(flow: SetupFlow): Promise<void> {
    if (process.env.AIDD_SKIP_MARKETPLACE_REFRESH === "1") return;
    await this.marketplaceRefreshUseCase.execute({ projectRoot: flow.projectRoot });
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
    context: ProjectContext | undefined
  ): SetupResult {
    if (isNew) return { kind: "initialized", install, context };
    return { kind: "up-to-date", install, context };
  }
}
