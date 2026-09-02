import { homedir } from "node:os";
import "../../contexts/tools/domain/profiles/claude/profile.js";
import "../../contexts/tools/domain/profiles/codex/profile.js";
import "../../contexts/tools/domain/profiles/copilot/profile.js";
import "../../contexts/tools/domain/profiles/cursor/profile.js";
import "../../contexts/tools/domain/profiles/opencode/profile.js";
import "../../contexts/tools/domain/profiles/vscode/profile.js";
import { MarketplaceAddUseCase } from "../../contexts/distribution/application/marketplace-add-use-case.js";
import type { MarketplaceListUseCase } from "../../contexts/distribution/application/marketplace-list-use-case.js";
import type { MarketplaceRefreshUseCase } from "../../contexts/distribution/application/marketplace-refresh-use-case.js";
import type { MarketplaceRegisterFrameworkUseCase } from "../../contexts/distribution/application/marketplace-register-framework-use-case.js";
import type { ResolveMarketplaceUseCase } from "../../contexts/distribution/application/resolve-marketplace-use-case.js";
import type { MarketplaceRegistry } from "../../contexts/distribution/domain/ports/marketplace-registry.js";
import type { MarketplaceTrustStore } from "../../contexts/distribution/domain/ports/marketplace-trust-store.js";
import type { PluginCatalogRepository } from "../../contexts/distribution/domain/ports/plugin-catalog-repository.js";
import type { PluginFetcher } from "../../contexts/distribution/domain/ports/plugin-fetcher.js";
import { CleanUseCase } from "../../contexts/framework/application/clean-use-case.js";
import { DoctorLayoutUseCase } from "../../contexts/framework/application/doctor/doctor-layout-use-case.js";
import { DoctorMergeFilesUseCase } from "../../contexts/framework/application/doctor/doctor-merge-files-use-case.js";
import { DoctorPluginUseCase } from "../../contexts/framework/application/doctor/doctor-plugin-use-case.js";
import { DoctorReferencesUseCase } from "../../contexts/framework/application/doctor/doctor-references-use-case.js";
import { DoctorRegistrationUseCase } from "../../contexts/framework/application/doctor/doctor-registration-use-case.js";
import { DoctorTrackedFilesUseCase } from "../../contexts/framework/application/doctor/doctor-tracked-files-use-case.js";
import { DoctorUseCase } from "../../contexts/framework/application/doctor/doctor-use-case.js";
import { MarketplaceCheckUseCase } from "../../contexts/framework/application/flows/marketplace-check-use-case.js";
import { MarketplaceRemoveUseCase } from "../../contexts/framework/application/flows/marketplace-remove-use-case.js";
import { MarketplaceSyncSettingsUseCase } from "../../contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import { GitignoreUseCase } from "../../contexts/framework/application/gitignore-use-case.js";
import { DoctorAllUseCase } from "../../contexts/framework/application/global/doctor-all-use-case.js";
import { ResolveUpdateDecisionUseCase } from "../../contexts/framework/application/global/resolve-update-decision-use-case.js";
import { RestoreAllUseCase } from "../../contexts/framework/application/global/restore-all-use-case.js";
import { StatusAllUseCase } from "../../contexts/framework/application/global/status-all-use-case.js";
import { UpdateAiToolsUseCase } from "../../contexts/framework/application/global/update-ai-tools-use-case.js";
import { UpdateAllUseCase } from "../../contexts/framework/application/global/update-all-use-case.js";
import { UpdateIdeToolsUseCase } from "../../contexts/framework/application/global/update-ide-tools-use-case.js";
import { UpdateOneToolUseCase } from "../../contexts/framework/application/global/update-one-tool-use-case.js";
import { InstallAiToolUseCase } from "../../contexts/framework/application/install/install-ai-tool-use-case.js";
import { InstallIdeConfigUseCase } from "../../contexts/framework/application/install/install-ide-config-use-case.js";
import { InstallIdeToolUseCase } from "../../contexts/framework/application/install/install-ide-tool-use-case.js";
import { InstallRuntimeConfigUseCase } from "../../contexts/framework/application/install/install-runtime-config-use-case.js";
import { PostInstallPipelineUseCase } from "../../contexts/framework/application/install/post-install-pipeline-use-case.js";
import { UninstallToolsUseCase } from "../../contexts/framework/application/install/uninstall-tools-use-case.js";
import { PluginAddUseCase } from "../../contexts/framework/application/plugin/plugin-add-use-case.js";
import { PluginInstallFromMarketplaceUseCase } from "../../contexts/framework/application/plugin/plugin-install-from-marketplace-use-case.js";
import { PluginInstallUseCase } from "../../contexts/framework/application/plugin/plugin-install-use-case.js";
import { PluginListUseCase } from "../../contexts/framework/application/plugin/plugin-list-use-case.js";
import { PluginRemoveUseCase } from "../../contexts/framework/application/plugin/plugin-remove-use-case.js";
import { PluginSearchUseCase } from "../../contexts/framework/application/plugin/plugin-search-use-case.js";
import { PluginUpdateUseCase } from "../../contexts/framework/application/plugin/plugin-update-use-case.js";
import { RestoreUseCase } from "../../contexts/framework/application/restore/restore-use-case.js";
import { ProjectContextDetectorUseCase } from "../../contexts/framework/application/setup/project-context-detector-use-case.js";
import { SetupMarketplaceSourceUseCase } from "../../contexts/framework/application/setup/setup-marketplace-source-use-case.js";
import { SetupToolsUseCase } from "../../contexts/framework/application/setup/setup-tools-use-case.js";
import { DetectPluginDriftUseCase } from "../../contexts/framework/application/shared/detect-plugin-drift-use-case.js";
import {
  EnsureBuiltMarketplaceUseCase,
  type FrameworkBuildFor,
} from "../../contexts/framework/application/shared/ensure-built-marketplace-use-case.js";
import { StatusUseCase } from "../../contexts/framework/application/status-use-case.js";
import { UninstallIdeUseCase } from "../../contexts/framework/application/uninstall/uninstall-ide-use-case.js";
import { UninstallUseCase } from "../../contexts/framework/application/uninstall/uninstall-use-case.js";
import type { ManifestRepository } from "../../contexts/framework/domain/ports/manifest-repository.js";
import type { PluginDistributionReader } from "../../contexts/framework/domain/ports/plugin-distribution-reader.js";
import { ManifestRepositoryAdapter } from "../../contexts/framework/infrastructure/manifest-repository-adapter.js";
import { PluginDistributionReaderAdapter } from "../../contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import type { FileMerger } from "../../contexts/tools/domain/ports/file-merger.js";
import type { FrameworkBuildUseCase } from "../../contexts/translate/application/translate-source.js";
import type { Prompter } from "../../domain/ports/prompter.js";
import { FileAdapter } from "../../infrastructure/adapters/file-adapter.js";
import { HasherAdapter } from "../../infrastructure/adapters/hasher-adapter.js";
import { BundledAssetProviderAdapter } from "../../infrastructure/assets/asset-loader.js";
import { userConfigDir } from "../../infrastructure/user-config-dir.js";
import type { AssetProvider } from "../../kernel/ports/asset-provider.js";
import type { FileReader } from "../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../kernel/ports/file-writer.js";
import type { Hasher } from "../../kernel/ports/hasher.js";
import type { Logger } from "../../kernel/ports/logger.js";
import { CLIOutput } from "../../presentation/output.js";
import { PluginPickUseCase } from "../../presentation/prompts/plugin-pick-use-case.js";
import { SetupPluginsPromptUseCase } from "../../presentation/prompts/setup-plugins-prompt-use-case.js";
import { SetupToolsPromptUseCase } from "../../presentation/prompts/setup-tools-prompt-use-case.js";
import { SyncConflictResolverUseCase } from "../../presentation/prompts/sync-conflict-resolver-use-case.js";
import { AuthProviderAdapter } from "../auth/auth-provider-adapter.js";
import { AuthReaderAdapter } from "../auth/auth-reader-adapter.js";
import { AuthStorage } from "../auth/auth-storage.js";
import { GhCliAdapter } from "../auth/gh-cli-adapter.js";
import { GhTokenAdapter } from "../auth/gh-token-adapter.js";
import type { CredentialStore } from "../auth/ports/credential-store.js";
import { RequireAuthUseCase } from "../auth/require-auth-use-case.js";
import { HttpClient } from "../http/http-client.js";
import type { Platform } from "../platform/platform.js";
import { PlatformAdapter } from "../platform/platform-adapter.js";
import { InquirerPrompterAdapter, SilentPrompterAdapter } from "../prompter/prompter-adapter.js";
import { CheckUpdateUseCase } from "../self-update/check-update-use-case.js";
import { CurrentVersionAdapter } from "../self-update/current-version-adapter.js";
import { GitAdapter } from "../self-update/git-adapter.js";
import { GitHubReleaseResolverAdapter } from "../self-update/github-release-resolver-adapter.js";
import type { LatestReleaseResolver } from "../self-update/latest-release-resolver.js";
import { SelfUpdateUseCase } from "../self-update/self-update-use-case.js";
import type { SelfUpdater } from "../self-update/self-updater.js";
import { SelfUpdaterAdapter } from "../self-update/self-updater-adapter.js";
import type { VersionControl } from "../self-update/version-control.js";
import type { VersionReader } from "../self-update/version-reader.js";
import { wireDistribution } from "./distribution.js";
import { wireTools } from "./tools.js";
import { createFrameworkBuildUseCase, wireTranslate } from "./translate.js";

interface GlobalOptions {
  verbose: boolean;
}

interface Deps {
  fs: FileReader & FileWriter & FileMerger;
  manifestRepo: ManifestRepository;
  hasher: Hasher;
  logger: Logger;
  cliUpdater: SelfUpdater;
  currentVersionProvider: VersionReader;
  git: VersionControl;
  platform: Platform;
  prompter: Prompter;
  authReader: AuthReaderAdapter;
  authStorage: AuthStorage;
  credentialStore: CredentialStore;
  http: HttpClient;
  pluginCatalogRepository: PluginCatalogRepository;
  pluginFetcher: PluginFetcher;
  pluginDistributionReader: PluginDistributionReader;
  marketplaceRegistry: MarketplaceRegistry;
  marketplaceTrustStore: MarketplaceTrustStore;
  pluginAddUseCase: PluginAddUseCase;
  frameworkBuildUseCase: FrameworkBuildUseCase;
  pluginRemoveUseCase: PluginRemoveUseCase;
  pluginListUseCase: PluginListUseCase;
  pluginUpdateUseCase: PluginUpdateUseCase;
  marketplaceAddUseCase: MarketplaceAddUseCase;
  marketplaceListUseCase: MarketplaceListUseCase;
  marketplaceRemoveUseCase: MarketplaceRemoveUseCase;
  marketplaceRefreshUseCase: MarketplaceRefreshUseCase;
  marketplaceCheckUseCase: MarketplaceCheckUseCase;
  pluginInstallFromMarketplaceUseCase: PluginInstallFromMarketplaceUseCase;
  resolveMarketplaceUseCase: ResolveMarketplaceUseCase;
  ensureBuiltMarketplaceUseCase: EnsureBuiltMarketplaceUseCase;
  installRuntimeConfigUseCase: InstallRuntimeConfigUseCase;
  installAiToolUseCase: InstallAiToolUseCase;
  installIdeConfigUseCase: InstallIdeConfigUseCase;
  installIdeToolUseCase: InstallIdeToolUseCase;
  uninstallIdeUseCase: UninstallIdeUseCase;
  assetProvider: AssetProvider;
  pluginSearchUseCase: PluginSearchUseCase;
  marketplaceRegisterFrameworkUseCase: MarketplaceRegisterFrameworkUseCase;
  pluginPickUseCase: PluginPickUseCase;
  pluginInstallUseCase: PluginInstallUseCase;
  marketplaceSyncSettingsUseCase: MarketplaceSyncSettingsUseCase;
  syncConflictResolverUseCase: SyncConflictResolverUseCase;
  doctorUseCase: DoctorUseCase;
  releaseResolver: LatestReleaseResolver;
  setupMarketplaceSourceUseCase: SetupMarketplaceSourceUseCase;
  setupToolsUseCase: SetupToolsUseCase;
  setupPluginsPromptUseCase: SetupPluginsPromptUseCase;
  setupToolsPromptUseCase: SetupToolsPromptUseCase;
  projectContextDetector: ProjectContextDetectorUseCase;
  requireAuthUseCase: RequireAuthUseCase;
  selfUpdateUseCase: SelfUpdateUseCase;
  statusUseCase: StatusUseCase;
  restoreUseCase: RestoreUseCase;
  uninstallUseCase: UninstallUseCase;
  statusAllUseCase: StatusAllUseCase;
  restoreAllUseCase: RestoreAllUseCase;
  updateAllUseCase: UpdateAllUseCase;
  updateAiToolsUseCase: UpdateAiToolsUseCase;
  updateIdeToolsUseCase: UpdateIdeToolsUseCase;
  cleanUseCase: CleanUseCase;
  doctorAllUseCase: DoctorAllUseCase;
  checkUpdateUseCase: CheckUpdateUseCase;
}

const _cache = new Map<string, Deps>();

export function createMenuDeps(projectRoot: string): {
  manifestRepo: ManifestRepository;
  prompter: Prompter;
} {
  return {
    manifestRepo: new ManifestRepositoryAdapter(projectRoot),
    prompter: process.stdout.isTTY ? new InquirerPrompterAdapter() : new SilentPrompterAdapter(),
  };
}

export async function createDeps(
  projectRoot: string,
  options: GlobalOptions,
  output?: CLIOutput
): Promise<Deps> {
  const cached = _cache.get(projectRoot);
  if (cached !== undefined) return cached;
  const hasher = new HasherAdapter();
  const logger = output ?? new CLIOutput(options.verbose);
  const fs = new FileAdapter(hasher, logger);
  const pluginDistributionReader = new PluginDistributionReaderAdapter(fs);
  const manifestRepo = new ManifestRepositoryAdapter(projectRoot);
  const http = new HttpClient();
  const authStorage = new AuthStorage();
  const ghCliAdapter = new GhCliAdapter();
  const authReader = new AuthReaderAdapter(authStorage, projectRoot, logger, ghCliAdapter);
  const credentialStore = new AuthProviderAdapter(
    authStorage,
    new Map([["gh", ghCliAdapter]]),
    new GhTokenAdapter(http),
    projectRoot
  );
  const cliUpdater = new SelfUpdaterAdapter(http, {
    tokenProvider: authReader,
    githubApiBase: process.env.AIDD_SELF_UPDATE_API_BASE,
    npmRegistryBase: process.env.AIDD_SELF_UPDATE_NPM_BASE,
    logger,
  });
  const currentVersionProvider = new CurrentVersionAdapter();
  const requireAuthUseCase = new RequireAuthUseCase(authReader);
  const selfUpdateUseCase = new SelfUpdateUseCase(cliUpdater, currentVersionProvider);
  const git = new GitAdapter(fs);
  const platform = new PlatformAdapter();
  const prompter = process.stdout.isTTY
    ? new InquirerPrompterAdapter()
    : new SilentPrompterAdapter();
  const { nativePluginActivators } = wireTools();
  const {
    pluginCatalogRepository,
    pluginFetcher,
    marketplaceRegistry,
    marketplaceTrustStore,
    resolveMarketplaceUseCase,
    marketplaceListUseCase,
    marketplaceRefreshUseCase,
    marketplaceRegisterFrameworkUseCase,
  } = wireDistribution({ fs, hasher, http, authReader, logger, projectRoot });
  const pluginRemoveUseCase = new PluginRemoveUseCase(fs, manifestRepo);
  const pluginListUseCase = new PluginListUseCase(manifestRepo);
  const marketplaceRemoveUseCase = new MarketplaceRemoveUseCase(
    fs,
    manifestRepo,
    marketplaceRegistry,
    prompter
  );
  // `marketplace add --overwrite` removes before it adds, and removing deletes the
  // installed plugin files — framework work. The orchestration belongs here, where
  // both distribution's and framework's use cases are already in scope, rather than
  // pulling framework into distribution's own wiring (see tests/architecture/context-graph).
  const marketplaceAddUseCase = new MarketplaceAddUseCase(
    marketplaceRegistry,
    marketplaceTrustStore,
    resolveMarketplaceUseCase,
    prompter,
    marketplaceRemoveUseCase
  );
  const marketplaceCheckUseCase = new MarketplaceCheckUseCase(
    manifestRepo,
    marketplaceRegistry,
    resolveMarketplaceUseCase
  );
  const assetProvider = new BundledAssetProviderAdapter();
  const { frameworkBuildUseCase } = wireTranslate({ fs, assetProvider, logger });
  // force:true is safe here: outDir is always builtMarketplaceDir(), an aidd-owned
  // disposable cache under .aidd/cache/built/, never a user-owned directory. A
  // collision only means "the cache from a previous build already exists" — the
  // whole point of a rebuild. The real user --force (framework.ts) is unrelated
  // and already threaded correctly for the direct `framework build --flat` path.
  // The build's own diagnostics belong to `aidd framework build`, where the user asked
  // for a build and wants to know what it skipped. Here the build is a cache being
  // brought up to date, which happens behind almost every command — repeating those
  // lines each time would report an implementation detail as if it were news. They are
  // still traced, so `--verbose` shows them.
  const cacheBuildLogger: Logger = {
    debug: (message) => logger.debug(message),
    info: (message) => logger.debug(message),
    warn: (message) => logger.debug(message),
  };
  const frameworkBuildFor: FrameworkBuildFor = (target, mode, outDir) =>
    createFrameworkBuildUseCase(
      { fs, assetProvider, logger: cacheBuildLogger },
      { target, mode, outDir, force: true }
    );
  const ensureBuiltMarketplaceUseCase = new EnsureBuiltMarketplaceUseCase(
    fs,
    resolveMarketplaceUseCase,
    frameworkBuildFor,
    currentVersionProvider,
    userConfigDir
  );
  const marketplaceSyncSettingsUseCase = new MarketplaceSyncSettingsUseCase(
    fs,
    manifestRepo,
    marketplaceRegistry,
    pluginCatalogRepository,
    hasher,
    logger,
    nativePluginActivators,
    ensureBuiltMarketplaceUseCase
  );
  const pluginAddUseCase = new PluginAddUseCase(
    fs,
    manifestRepo,
    pluginFetcher,
    pluginDistributionReader,
    hasher,
    logger,
    marketplaceRegistry,
    ensureBuiltMarketplaceUseCase
  );
  const gitignoreUseCase = new GitignoreUseCase(fs);
  const postInstallPipelineUseCase = new PostInstallPipelineUseCase(manifestRepo, gitignoreUseCase);
  const installRuntimeConfigUseCase = new InstallRuntimeConfigUseCase(
    fs,
    hasher,
    logger,
    assetProvider,
    postInstallPipelineUseCase
  );
  const installIdeConfigUseCase = new InstallIdeConfigUseCase(
    fs,
    hasher,
    logger,
    assetProvider,
    postInstallPipelineUseCase
  );
  const installIdeToolUseCase = new InstallIdeToolUseCase(
    installIdeConfigUseCase,
    manifestRepo,
    fs,
    hasher,
    postInstallPipelineUseCase,
    assetProvider
  );
  const uninstallIdeUseCase = new UninstallIdeUseCase(
    manifestRepo,
    new UninstallToolsUseCase(fs, logger)
  );
  const pluginInstallFromMarketplaceUseCase = new PluginInstallFromMarketplaceUseCase(
    resolveMarketplaceUseCase,
    marketplaceRegistry,
    pluginAddUseCase,
    prompter,
    logger
  );
  const pluginSearchUseCase = new PluginSearchUseCase(
    marketplaceRegistry,
    resolveMarketplaceUseCase
  );
  const pluginPickUseCase = new PluginPickUseCase(
    marketplaceRegistry,
    resolveMarketplaceUseCase,
    pluginAddUseCase,
    prompter
  );
  const pluginInstallUseCase = new PluginInstallUseCase(
    pluginPickUseCase,
    pluginAddUseCase,
    pluginInstallFromMarketplaceUseCase,
    manifestRepo,
    marketplaceTrustStore,
    prompter
  );
  const installAiToolUseCase = new InstallAiToolUseCase(
    installRuntimeConfigUseCase,
    manifestRepo,
    pluginInstallFromMarketplaceUseCase,
    marketplaceSyncSettingsUseCase,
    logger
  );
  const syncConflictResolverUseCase = new SyncConflictResolverUseCase(fs);
  const doctorTrackedFilesUseCase = new DoctorTrackedFilesUseCase(fs);
  const doctorMergeFilesUseCase = new DoctorMergeFilesUseCase(fs, hasher);
  const detectPluginDriftUseCase = new DetectPluginDriftUseCase(fs);
  const doctorPluginUseCase = new DoctorPluginUseCase(detectPluginDriftUseCase);
  const doctorReferencesUseCase = new DoctorReferencesUseCase(fs);
  const doctorLayoutUseCase = new DoctorLayoutUseCase(fs, authReader);
  const doctorUseCase = new DoctorUseCase(
    manifestRepo,
    doctorTrackedFilesUseCase,
    doctorMergeFilesUseCase,
    doctorPluginUseCase,
    doctorReferencesUseCase,
    doctorLayoutUseCase,
    new DoctorRegistrationUseCase(fs, marketplaceRegistry, nativePluginActivators)
  );
  const releaseResolver = new GitHubReleaseResolverAdapter(http, authReader);
  const setupMarketplaceSourceUseCase = new SetupMarketplaceSourceUseCase(
    prompter,
    releaseResolver
  );
  const setupToolsUseCase = new SetupToolsUseCase(
    manifestRepo,
    installRuntimeConfigUseCase,
    installIdeConfigUseCase
  );
  const setupPluginsPromptUseCase = new SetupPluginsPromptUseCase(
    pluginPickUseCase,
    pluginInstallFromMarketplaceUseCase,
    marketplaceRegistry,
    resolveMarketplaceUseCase
  );
  const setupToolsPromptUseCase = new SetupToolsPromptUseCase(prompter);
  const projectContextDetector = new ProjectContextDetectorUseCase(fs);
  const statusUseCase = new StatusUseCase(fs, manifestRepo, hasher, detectPluginDriftUseCase);
  // Lets restore re-materialize cursor/opencode plugins via the build pipeline,
  // matching what install wrote (otherwise restore rewrites raw content → drift).
  const builtMaterializationDeps = {
    ensureBuilt: ensureBuiltMarketplaceUseCase,
    marketplaceRegistry,
    homedir,
  };
  const pluginUpdateUseCase = new PluginUpdateUseCase(
    fs,
    manifestRepo,
    pluginFetcher,
    pluginDistributionReader,
    hasher,
    builtMaterializationDeps
  );
  const restoreUseCase = new RestoreUseCase(
    fs,
    manifestRepo,
    hasher,
    logger,
    platform,
    prompter,
    pluginFetcher,
    pluginDistributionReader,
    assetProvider,
    builtMaterializationDeps
  );
  const uninstallUseCase = new UninstallUseCase(fs, manifestRepo, logger);
  const statusAllUseCase = new StatusAllUseCase(statusUseCase);
  const restoreAllUseCase = new RestoreAllUseCase(
    manifestRepo,
    prompter,
    statusUseCase,
    restoreUseCase
  );
  const resolveUpdateDecisionUseCase = new ResolveUpdateDecisionUseCase(prompter);
  const updateOneToolUseCase = new UpdateOneToolUseCase(
    installRuntimeConfigUseCase,
    installIdeConfigUseCase,
    syncConflictResolverUseCase,
    resolveUpdateDecisionUseCase,
    fs
  );
  const updateAllUseCase = new UpdateAllUseCase(
    manifestRepo,
    currentVersionProvider,
    pluginUpdateUseCase,
    marketplaceRefreshUseCase,
    updateOneToolUseCase,
    marketplaceSyncSettingsUseCase
  );
  const updateAiToolsUseCase = new UpdateAiToolsUseCase(
    manifestRepo,
    currentVersionProvider,
    updateOneToolUseCase
  );
  const updateIdeToolsUseCase = new UpdateIdeToolsUseCase(
    manifestRepo,
    currentVersionProvider,
    updateOneToolUseCase
  );
  const cleanUseCase = new CleanUseCase(fs, manifestRepo, logger, gitignoreUseCase, prompter);
  const doctorAllUseCase = new DoctorAllUseCase(doctorUseCase);
  const checkUpdateUseCase = new CheckUpdateUseCase(cliUpdater, currentVersionProvider, logger, fs);
  const deps: Deps = {
    fs,
    manifestRepo,
    hasher,
    logger,
    cliUpdater,
    currentVersionProvider,
    git,
    platform,
    prompter,
    authReader,
    authStorage,
    credentialStore,
    http,
    pluginCatalogRepository,
    pluginFetcher,
    pluginDistributionReader,
    marketplaceRegistry,
    marketplaceTrustStore,
    pluginAddUseCase,
    frameworkBuildUseCase,
    pluginRemoveUseCase,
    pluginListUseCase,
    pluginUpdateUseCase,
    marketplaceAddUseCase,
    marketplaceListUseCase,
    marketplaceRemoveUseCase,
    marketplaceRefreshUseCase,
    marketplaceCheckUseCase,
    pluginInstallFromMarketplaceUseCase,
    resolveMarketplaceUseCase,
    ensureBuiltMarketplaceUseCase,
    installRuntimeConfigUseCase,
    installAiToolUseCase,
    installIdeConfigUseCase,
    installIdeToolUseCase,
    uninstallIdeUseCase,
    assetProvider,
    pluginSearchUseCase,
    marketplaceRegisterFrameworkUseCase,
    pluginPickUseCase,
    pluginInstallUseCase,
    marketplaceSyncSettingsUseCase,
    syncConflictResolverUseCase,
    doctorUseCase,
    releaseResolver,
    setupMarketplaceSourceUseCase,
    setupToolsUseCase,
    setupPluginsPromptUseCase,
    setupToolsPromptUseCase,
    projectContextDetector,
    requireAuthUseCase,
    selfUpdateUseCase,
    statusUseCase,
    restoreUseCase,
    uninstallUseCase,
    statusAllUseCase,
    restoreAllUseCase,
    updateAllUseCase,
    updateAiToolsUseCase,
    updateIdeToolsUseCase,
    cleanUseCase,
    doctorAllUseCase,
    checkUpdateUseCase,
  };
  _cache.set(projectRoot, deps);
  return deps;
}
