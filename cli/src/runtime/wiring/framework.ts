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
import { CleanUserScopeUseCase } from "../../contexts/framework/application/clean/clean-user-scope-use-case.js";
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
import { UpdateIdeToolsUseCase } from "../../contexts/framework/application/global/update-ide-tools-use-case.js";
import { UpdateOneToolUseCase } from "../../contexts/framework/application/global/update-one-tool-use-case.js";
import { InstallAiToolUseCase } from "../../contexts/framework/application/install/install-ai-tool-use-case.js";
import { InstallIdeConfigUseCase } from "../../contexts/framework/application/install/install-ide-config-use-case.js";
import { InstallIdeToolUseCase } from "../../contexts/framework/application/install/install-ide-tool-use-case.js";
import { InstallRuntimeConfigUseCase } from "../../contexts/framework/application/install/install-runtime-config-use-case.js";
import { PostInstallPipelineUseCase } from "../../contexts/framework/application/install/post-install-pipeline-use-case.js";
import { ListInstalledRulesUseCase } from "../../contexts/framework/application/list-installed-rules-use-case.js";
import { PluginAddUseCase } from "../../contexts/framework/application/plugin/plugin-add-use-case.js";
import { PluginInstallFromMarketplaceUseCase } from "../../contexts/framework/application/plugin/plugin-install-from-marketplace-use-case.js";
import { PluginInstallUseCase } from "../../contexts/framework/application/plugin/plugin-install-use-case.js";
import { PluginListUseCase } from "../../contexts/framework/application/plugin/plugin-list-use-case.js";
import { PluginRemoveUseCase } from "../../contexts/framework/application/plugin/plugin-remove-use-case.js";
import { PluginSearchUseCase } from "../../contexts/framework/application/plugin/plugin-search-use-case.js";
import { PluginUpdateUseCase } from "../../contexts/framework/application/plugin/plugin-update-use-case.js";
import { RestoreUseCase } from "../../contexts/framework/application/restore/restore-use-case.js";
import { ProjectContextDetectorUseCase } from "../../contexts/framework/application/setup/project-context-detector-use-case.js";
import { SetupMachineScopeUseCase } from "../../contexts/framework/application/setup/setup-machine-scope-use-case.js";
import { SetupMarketplaceSourceUseCase } from "../../contexts/framework/application/setup/setup-marketplace-source-use-case.js";
import { SetupToolsUseCase } from "../../contexts/framework/application/setup/setup-tools-use-case.js";
import { DetectPluginDriftUseCase } from "../../contexts/framework/application/shared/detect-plugin-drift-use-case.js";
import {
  EnsureBuiltMarketplaceUseCase,
  type FrameworkBuildFor,
} from "../../contexts/framework/application/shared/ensure-built-marketplace-use-case.js";
import { SetupMarketplaceRegistrationUseCase } from "../../contexts/framework/application/shared/setup-marketplace-registration-use-case.js";
import { StatusUseCase } from "../../contexts/framework/application/status-use-case.js";
import { UninstallIdeUseCase } from "../../contexts/framework/application/uninstall/uninstall-ide-use-case.js";
import { UninstallToolsUseCase } from "../../contexts/framework/application/uninstall/uninstall-tools-use-case.js";
import { UninstallUseCase } from "../../contexts/framework/application/uninstall/uninstall-use-case.js";
import type { Environment } from "../../contexts/framework/domain/ports/environment.js";
import type { ManifestRepository } from "../../contexts/framework/domain/ports/manifest-repository.js";
import type { UserSourceReferences } from "../../contexts/framework/domain/ports/user-source-references.js";
import { EnvironmentAdapter } from "../../contexts/framework/infrastructure/environment-adapter.js";
import { ManifestRepositoryAdapter } from "../../contexts/framework/infrastructure/manifest-repository-adapter.js";
import { PluginDistributionReaderAdapter } from "../../contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { UserManifestRepositoryAdapter } from "../../contexts/framework/infrastructure/user-manifest-repository-adapter.js";
import { UserSourceReferencesAdapter } from "../../contexts/framework/infrastructure/user-source-references-adapter.js";
import type { FileMerger } from "../../contexts/tools/domain/ports/file-merger.js";
import { hostPluginRegistryReaders } from "../../contexts/tools/infrastructure/host-plugin-registry-reader-adapter.js";
import type { AssetProvider } from "../../kernel/ports/asset-provider.js";
import type { FileReader } from "../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../kernel/ports/file-writer.js";
import type { Logger } from "../../kernel/ports/logger.js";
import type { Prompter } from "../../kernel/ports/prompter.js";
import type { VersionReader } from "../../kernel/ports/version-reader.js";
import { CLIOutput } from "../../presentation/output.js";
import { PluginPickUseCase } from "../../presentation/prompts/plugin-pick-use-case.js";
import { SetupPluginsPromptUseCase } from "../../presentation/prompts/setup-plugins-prompt-use-case.js";
import { SetupToolsPromptUseCase } from "../../presentation/prompts/setup-tools-prompt-use-case.js";
import { SyncConflictResolverUseCase } from "../../presentation/prompts/sync-conflict-resolver-use-case.js";
import { BundledAssetProviderAdapter } from "../assets/asset-loader.js";
import { AuthProviderAdapter } from "../auth/auth-provider-adapter.js";
import { AuthReaderAdapter } from "../auth/auth-reader-adapter.js";
import { AuthStorage } from "../auth/auth-storage.js";
import { GhCliAdapter } from "../auth/gh-cli-adapter.js";
import { GhTokenAdapter } from "../auth/gh-token-adapter.js";
import type { CredentialStore } from "../auth/ports/credential-store.js";
import { FileAdapter } from "../filesystem/file-adapter.js";
import { HasherAdapter } from "../filesystem/hasher-adapter.js";
import { GitAdapter } from "../git/git-adapter.js";
import { HttpClient } from "../http/http-client.js";
import { PlatformAdapter } from "../platform/platform-adapter.js";
import { InquirerPrompterAdapter, SilentPrompterAdapter } from "../prompter/prompter-adapter.js";
import { CheckUpdateUseCase } from "../self-update/check-update-use-case.js";
import { CurrentVersionAdapter } from "../self-update/current-version-adapter.js";
import { GitHubReleaseResolverAdapter } from "../self-update/github-release-resolver-adapter.js";
import type { LatestReleaseResolver } from "../self-update/latest-release-resolver.js";
import { SelfUpdateUseCase } from "../self-update/self-update-use-case.js";
import { SelfUpdaterAdapter } from "../self-update/self-updater-adapter.js";
import { userConfigDir } from "../user-config-dir.js";
import { wireDistribution } from "./distribution.js";
import { type TelemetryDeps, wireTelemetry } from "./telemetry.js";
import { wireTools } from "./tools.js";
import { createFrameworkBuildUseCase } from "./translate.js";

interface GlobalOptions {
  verbose: boolean;
  token?: string;
}

interface Deps extends TelemetryDeps {
  fs: FileReader & FileWriter & FileMerger;
  manifestRepo: ManifestRepository;
  /** `--scope user`'s own manifest repository: `userConfigDir()/manifest.json`, never nested
   * under a project's `.aidd/`. */
  userManifestRepo: ManifestRepository;
  /** The one home-directory resolver presentation calls, never `os.homedir()` directly, so a
   * test can point it elsewhere. */
  homedir: () => string;
  environment: Environment;
  logger: Logger;
  currentVersionProvider: VersionReader;
  prompter: Prompter;
  authReader: AuthReaderAdapter;
  credentialStore: CredentialStore;
  pluginRemoveUseCase: PluginRemoveUseCase;
  pluginListUseCase: PluginListUseCase;
  pluginUpdateUseCase: PluginUpdateUseCase;
  marketplaceAddUseCase: MarketplaceAddUseCase;
  marketplaceListUseCase: MarketplaceListUseCase;
  marketplaceRemoveUseCase: MarketplaceRemoveUseCase;
  marketplaceRefreshUseCase: MarketplaceRefreshUseCase;
  marketplaceCheckUseCase: MarketplaceCheckUseCase;
  userSourceReferences: UserSourceReferences;
  installAiToolUseCase: InstallAiToolUseCase;
  installIdeToolUseCase: InstallIdeToolUseCase;
  uninstallIdeUseCase: UninstallIdeUseCase;
  assetProvider: AssetProvider;
  pluginSearchUseCase: PluginSearchUseCase;
  marketplaceRegisterFrameworkUseCase: MarketplaceRegisterFrameworkUseCase;
  pluginInstallUseCase: PluginInstallUseCase;
  marketplaceSyncSettingsUseCase: MarketplaceSyncSettingsUseCase;
  doctorUseCase: DoctorUseCase;
  /** The registration check alone, reused directly by `doctor --scope user`. */
  doctorRegistrationUseCase: DoctorRegistrationUseCase;
  releaseResolver: LatestReleaseResolver;
  setupMarketplaceSourceUseCase: SetupMarketplaceSourceUseCase;
  setupToolsUseCase: SetupToolsUseCase;
  setupPluginsPromptUseCase: SetupPluginsPromptUseCase;
  setupToolsPromptUseCase: SetupToolsPromptUseCase;
  projectContextDetector: ProjectContextDetectorUseCase;
  setupMarketplaceRegistration: SetupMarketplaceRegistrationUseCase;
  setupMachineScopeUseCase: SetupMachineScopeUseCase;
  selfUpdateUseCase: SelfUpdateUseCase;
  statusUseCase: StatusUseCase;
  restoreUseCase: RestoreUseCase;
  uninstallUseCase: UninstallUseCase;
  statusAllUseCase: StatusAllUseCase;
  restoreAllUseCase: RestoreAllUseCase;
  updateAiToolsUseCase: UpdateAiToolsUseCase;
  updateIdeToolsUseCase: UpdateIdeToolsUseCase;
  cleanUseCase: CleanUseCase;
  cleanUserScopeUseCase: CleanUserScopeUseCase;
  doctorAllUseCase: DoctorAllUseCase;
  listInstalledRulesUseCase: ListInstalledRulesUseCase;
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
  const cacheKey = `${projectRoot}\u0000${options.token ?? ""}`;
  const cached = _cache.get(cacheKey);
  if (cached !== undefined) return cached;
  const hasher = new HasherAdapter();
  const logger = output ?? new CLIOutput(options.verbose);
  const fs = new FileAdapter(hasher, logger);
  const pluginDistributionReader = new PluginDistributionReaderAdapter(fs);
  const manifestRepo = new ManifestRepositoryAdapter(projectRoot);
  const userManifestRepo = new UserManifestRepositoryAdapter(userConfigDir);
  const http = new HttpClient();
  const authStorage = new AuthStorage();
  const ghCliAdapter = new GhCliAdapter();
  const authReader = new AuthReaderAdapter(
    authStorage,
    projectRoot,
    logger,
    ghCliAdapter,
    options.token
  );
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
  const selfUpdateUseCase = new SelfUpdateUseCase(cliUpdater, currentVersionProvider);
  const platform = new PlatformAdapter();
  const environment = new EnvironmentAdapter();
  const prompter = process.stdout.isTTY
    ? new InquirerPrompterAdapter()
    : new SilentPrompterAdapter();
  const { nativePluginActivators, hostMarketplaceRegistries } = wireTools();
  // Read once, reused wherever a use case needs the scope a plugin is actually registered
  // at: removal, clean, and doctor's own registration check.
  const hostPluginRegistries = hostPluginRegistryReaders();
  // Built ahead of every use case that reads a shared-source claim: it depends only on `fs`
  // and `userConfigDir`, neither of which distribution's own wiring produces.
  const userSourceReferences = new UserSourceReferencesAdapter(fs, userConfigDir);
  const {
    pluginFetcher,
    marketplaceRegistry,
    marketplaceTrustStore,
    resolveMarketplaceUseCase,
    marketplaceListUseCase,
    marketplaceRefreshUseCase,
    marketplaceRegisterFrameworkUseCase,
  } = wireDistribution({ fs, hasher, http, authReader, logger, projectRoot });
  const pluginRemoveUseCase = new PluginRemoveUseCase(
    fs,
    manifestRepo,
    logger,
    nativePluginActivators,
    hostPluginRegistries,
    userSourceReferences,
    marketplaceRegistry
  );
  const pluginListUseCase = new PluginListUseCase(manifestRepo);
  const marketplaceRemoveUseCase = new MarketplaceRemoveUseCase(
    fs,
    manifestRepo,
    marketplaceRegistry,
    prompter
  );
  // `marketplace add --overwrite` removes before it adds, and removing deletes installed
  // plugin files — framework work — so the orchestration belongs here rather than pulling
  // framework into distribution's own wiring.
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
  // `force: true` is safe here: `outDir` is always an aidd-owned disposable cache, never a
  // user-owned directory, so a collision only means a previous build's cache exists. Its
  // diagnostics drop to debug because this build runs behind almost every command, where
  // they would report an implementation detail as news; `--verbose` still shows them.
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
    hasher,
    logger,
    nativePluginActivators,
    ensureBuiltMarketplaceUseCase,
    hostMarketplaceRegistries,
    userConfigDir,
    marketplaceRegisterFrameworkUseCase,
    userSourceReferences,
    currentVersionProvider
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
  const git = new GitAdapter(fs);
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
  // Named so `doctor --scope user` reuses this instance: the check takes its manifest and
  // project root per call, so nothing about it is project-scope-specific.
  const doctorRegistrationUseCase = new DoctorRegistrationUseCase(
    fs,
    marketplaceRegistry,
    nativePluginActivators,
    hostPluginRegistries,
    hostMarketplaceRegistries,
    userConfigDir,
    currentVersionProvider
  );
  const doctorUseCase = new DoctorUseCase(
    manifestRepo,
    doctorTrackedFilesUseCase,
    doctorMergeFilesUseCase,
    doctorPluginUseCase,
    doctorReferencesUseCase,
    doctorLayoutUseCase,
    doctorRegistrationUseCase
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
  const setupMarketplaceRegistration = new SetupMarketplaceRegistrationUseCase(
    fs,
    setupMarketplaceSourceUseCase,
    marketplaceRegisterFrameworkUseCase,
    marketplaceRefreshUseCase,
    currentVersionProvider,
    logger,
    environment,
    authReader,
    releaseResolver,
    userSourceReferences
  );
  const setupMachineScopeUseCase = new SetupMachineScopeUseCase(
    userManifestRepo,
    setupMarketplaceRegistration,
    marketplaceSyncSettingsUseCase,
    currentVersionProvider
  );
  const statusUseCase = new StatusUseCase(fs, manifestRepo, hasher, detectPluginDriftUseCase);
  // Restore re-materializes through the build pipeline, matching what install wrote:
  // rewriting raw content instead would itself be drift.
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
  const cleanUseCase = new CleanUseCase(
    fs,
    manifestRepo,
    logger,
    gitignoreUseCase,
    nativePluginActivators,
    marketplaceRegistry,
    prompter,
    hostMarketplaceRegistries,
    undefined,
    userSourceReferences,
    hostPluginRegistries
  );
  const cleanUserScopeUseCase = new CleanUserScopeUseCase(
    fs,
    userManifestRepo,
    logger,
    marketplaceRegistry,
    userConfigDir,
    nativePluginActivators,
    hostMarketplaceRegistries,
    homedir,
    userSourceReferences,
    prompter
  );
  const doctorAllUseCase = new DoctorAllUseCase(doctorUseCase);
  const listInstalledRulesUseCase = new ListInstalledRulesUseCase(fs);
  const checkUpdateUseCase = new CheckUpdateUseCase(cliUpdater, currentVersionProvider, logger, fs);
  const telemetry = wireTelemetry({
    fs,
    logger,
    git,
    projectRoot,
    gitignoreUseCase,
    currentVersionProvider,
    manifestRepo,
  });
  const deps: Deps = {
    ...telemetry,
    fs,
    manifestRepo,
    userManifestRepo,
    homedir,
    environment,
    logger,
    currentVersionProvider,
    prompter,
    authReader,
    credentialStore,
    pluginRemoveUseCase,
    pluginListUseCase,
    pluginUpdateUseCase,
    marketplaceAddUseCase,
    marketplaceListUseCase,
    marketplaceRemoveUseCase,
    marketplaceRefreshUseCase,
    marketplaceCheckUseCase,
    userSourceReferences,
    installAiToolUseCase,
    installIdeToolUseCase,
    uninstallIdeUseCase,
    assetProvider,
    pluginSearchUseCase,
    marketplaceRegisterFrameworkUseCase,
    pluginInstallUseCase,
    marketplaceSyncSettingsUseCase,
    doctorUseCase,
    doctorRegistrationUseCase,
    releaseResolver,
    setupMarketplaceSourceUseCase,
    setupToolsUseCase,
    setupPluginsPromptUseCase,
    setupToolsPromptUseCase,
    projectContextDetector,
    setupMarketplaceRegistration,
    setupMachineScopeUseCase,
    selfUpdateUseCase,
    statusUseCase,
    restoreUseCase,
    uninstallUseCase,
    statusAllUseCase,
    restoreAllUseCase,
    updateAiToolsUseCase,
    updateIdeToolsUseCase,
    cleanUseCase,
    cleanUserScopeUseCase,
    doctorAllUseCase,
    listInstalledRulesUseCase,
    checkUpdateUseCase,
  };
  _cache.set(cacheKey, deps);
  return deps;
}
