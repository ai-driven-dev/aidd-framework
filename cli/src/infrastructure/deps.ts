import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import "../contexts/tools/domain/profiles/claude/profile.js";
import "../contexts/tools/domain/profiles/codex/profile.js";
import "../contexts/tools/domain/profiles/copilot/profile.js";
import "../contexts/tools/domain/profiles/cursor/profile.js";
import "../contexts/tools/domain/profiles/opencode/profile.js";
import "../contexts/tools/domain/profiles/vscode/profile.js";
import { CLIOutput } from "../application/output.js";
import { RequireAuthUseCase } from "../application/use-cases/auth/require-auth-use-case.js";
import { CheckUpdateUseCase } from "../application/use-cases/check-update-use-case.js";
import { CleanUseCase } from "../application/use-cases/clean-use-case.js";
import { DoctorLayoutUseCase } from "../application/use-cases/doctor/doctor-layout-use-case.js";
import { DoctorMergeFilesUseCase } from "../application/use-cases/doctor/doctor-merge-files-use-case.js";
import { DoctorPluginUseCase } from "../application/use-cases/doctor/doctor-plugin-use-case.js";
import { DoctorReferencesUseCase } from "../application/use-cases/doctor/doctor-references-use-case.js";
import { DoctorRegistrationUseCase } from "../application/use-cases/doctor/doctor-registration-use-case.js";
import { DoctorTrackedFilesUseCase } from "../application/use-cases/doctor/doctor-tracked-files-use-case.js";
import { DoctorUseCase } from "../application/use-cases/doctor/doctor-use-case.js";
import { MarketplaceCheckUseCase } from "../application/use-cases/flows/marketplace-check-use-case.js";
import { MarketplaceRemoveUseCase } from "../application/use-cases/flows/marketplace-remove-use-case.js";
import { MarketplaceSyncSettingsUseCase } from "../application/use-cases/flows/marketplace-sync-settings-use-case.js";
import { GitignoreUseCase } from "../application/use-cases/gitignore-use-case.js";
import { DoctorAllUseCase } from "../application/use-cases/global/doctor-all-use-case.js";
import { ResolveUpdateDecisionUseCase } from "../application/use-cases/global/resolve-update-decision-use-case.js";
import { RestoreAllUseCase } from "../application/use-cases/global/restore-all-use-case.js";
import { StatusAllUseCase } from "../application/use-cases/global/status-all-use-case.js";
import { UpdateAiToolsUseCase } from "../application/use-cases/global/update-ai-tools-use-case.js";
import { UpdateAllUseCase } from "../application/use-cases/global/update-all-use-case.js";
import { UpdateIdeToolsUseCase } from "../application/use-cases/global/update-ide-tools-use-case.js";
import { UpdateOneToolUseCase } from "../application/use-cases/global/update-one-tool-use-case.js";
import { PostInstallPipelineUseCase } from "../application/use-cases/install/post-install-pipeline-use-case.js";
import { PluginAddUseCase } from "../application/use-cases/plugin/plugin-add-use-case.js";
import { PluginInstallFromMarketplaceUseCase } from "../application/use-cases/plugin/plugin-install-from-marketplace-use-case.js";
import { PluginInstallUseCase } from "../application/use-cases/plugin/plugin-install-use-case.js";
import { PluginListUseCase } from "../application/use-cases/plugin/plugin-list-use-case.js";
import { PluginPickUseCase } from "../application/use-cases/plugin/plugin-pick-use-case.js";
import { PluginRemoveUseCase } from "../application/use-cases/plugin/plugin-remove-use-case.js";
import { PluginSearchUseCase } from "../application/use-cases/plugin/plugin-search-use-case.js";
import { PluginUpdateUseCase } from "../application/use-cases/plugin/plugin-update-use-case.js";
import { RestoreUseCase } from "../application/use-cases/restore/restore-use-case.js";
import { SelfUpdateUseCase } from "../application/use-cases/self-update-use-case.js";
import { ProjectContextDetectorUseCase } from "../application/use-cases/setup/project-context-detector-use-case.js";
import { SetupMarketplaceSourceUseCase } from "../application/use-cases/setup/setup-marketplace-source-use-case.js";
import { SetupPluginsPromptUseCase } from "../application/use-cases/setup/setup-plugins-prompt-use-case.js";
import { SetupToolsPromptUseCase } from "../application/use-cases/setup/setup-tools-prompt-use-case.js";
import { SetupToolsUseCase } from "../application/use-cases/setup/setup-tools-use-case.js";
import { DetectPluginDriftUseCase } from "../application/use-cases/shared/detect-plugin-drift-use-case.js";
import {
  EnsureBuiltMarketplaceUseCase,
  type FrameworkBuildFor,
} from "../application/use-cases/shared/ensure-built-marketplace-use-case.js";
import { StatusUseCase } from "../application/use-cases/status-use-case.js";
import { SyncConflictResolverUseCase } from "../application/use-cases/sync/sync-conflict-resolver-use-case.js";
import { UninstallIdeUseCase } from "../application/use-cases/uninstall/uninstall-ide-use-case.js";
import { UninstallUseCase } from "../application/use-cases/uninstall/uninstall-use-case.js";
import { FetchMarketplaceSourceUseCase } from "../contexts/distribution/application/fetch-marketplace-source-use-case.js";
import { MarketplaceAddUseCase } from "../contexts/distribution/application/marketplace-add-use-case.js";
import { MarketplaceListUseCase } from "../contexts/distribution/application/marketplace-list-use-case.js";
import { MarketplaceRefreshUseCase } from "../contexts/distribution/application/marketplace-refresh-use-case.js";
import { MarketplaceRegisterFrameworkUseCase } from "../contexts/distribution/application/marketplace-register-framework-use-case.js";
import { ResolveMarketplaceUseCase } from "../contexts/distribution/application/resolve-marketplace-use-case.js";
import type { MarketplaceRegistry } from "../contexts/distribution/domain/ports/marketplace-registry.js";
import type { MarketplaceTrustStore } from "../contexts/distribution/domain/ports/marketplace-trust-store.js";
import type { PluginCatalogRepository } from "../contexts/distribution/domain/ports/plugin-catalog-repository.js";
import type { PluginFetcher } from "../contexts/distribution/domain/ports/plugin-fetcher.js";
import { GitHubRawFetcherAdapter } from "../contexts/distribution/infrastructure/github-raw-fetcher-adapter.js";
import { MarketplaceCacheAdapter } from "../contexts/distribution/infrastructure/marketplace-cache-adapter.js";
import { MarketplaceRegistryAdapter } from "../contexts/distribution/infrastructure/marketplace-registry-adapter.js";
import { MarketplaceTrustStoreAdapter } from "../contexts/distribution/infrastructure/marketplace-trust-store-adapter.js";
import { PluginCatalogRepositoryAdapter } from "../contexts/distribution/infrastructure/plugin-catalog-repository-adapter.js";
import { PluginFetcherAdapter } from "../contexts/distribution/infrastructure/plugin-fetcher-adapter.js";
import { InstallAiToolUseCase } from "../contexts/tools/application/install-ai-tool-use-case.js";
import { InstallIdeConfigUseCase } from "../contexts/tools/application/install-ide-config-use-case.js";
import { InstallIdeToolUseCase } from "../contexts/tools/application/install-ide-tool-use-case.js";
import { InstallRuntimeConfigUseCase } from "../contexts/tools/application/install-runtime-config-use-case.js";
import { UninstallToolsUseCase } from "../contexts/tools/application/uninstall-tools-use-case.js";
import type { ToolBuildContract } from "../contexts/tools/domain/build-contract.js";
import type { FileMerger } from "../contexts/tools/domain/ports/file-merger.js";
import type { NativePluginActivator } from "../contexts/tools/domain/ports/native-plugin-activator.js";
import { buildCopilotMarketplaceContract } from "../contexts/tools/domain/profiles/copilot/build.js";
import { buildContractFor, nativeActivationOf } from "../contexts/tools/domain/registry.js";
import { NativePluginCliAdapter } from "../contexts/tools/infrastructure/native-plugin-cli-adapter.js";
import { FlatBuildStrategy } from "../contexts/translate/application/strategies/flat-build-strategy.js";
import { MarketplaceBuildStrategy } from "../contexts/translate/application/strategies/marketplace-build-strategy.js";
import { FrameworkBuildUseCase } from "../contexts/translate/application/translate-source.js";
import { AjvSchemaValidatorAdapter } from "../contexts/translate/infrastructure/schema-validator.js";
import type { CredentialStore } from "../domain/ports/credential-store.js";
import type { LatestReleaseResolver } from "../domain/ports/latest-release-resolver.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";
import type { Platform } from "../domain/ports/platform.js";
import type { PluginDistributionReader } from "../domain/ports/plugin-distribution-reader.js";
import type { Prompter } from "../domain/ports/prompter.js";
import type { SelfUpdater } from "../domain/ports/self-updater.js";
import type { VersionControl } from "../domain/ports/version-control.js";
import type { VersionReader } from "../domain/ports/version-reader.js";
import type { AssetProvider } from "../kernel/ports/asset-provider.js";
import type { FileReader } from "../kernel/ports/file-reader.js";
import type { FileWriter } from "../kernel/ports/file-writer.js";
import type { Hasher } from "../kernel/ports/hasher.js";
import type { Logger } from "../kernel/ports/logger.js";
import { AI_TOOL_IDS } from "../kernel/tool.js";
import { AuthProviderAdapter } from "./adapters/auth-provider-adapter.js";
import { AuthReaderAdapter } from "./adapters/auth-reader-adapter.js";
import { CurrentVersionAdapter } from "./adapters/current-version-adapter.js";
import { FileAdapter } from "./adapters/file-adapter.js";
import { GhCliAdapter } from "./adapters/gh-cli-adapter.js";
import { GhTokenAdapter } from "./adapters/gh-token-adapter.js";
import { GitAdapter } from "./adapters/git-adapter.js";
import { GitHubReleaseResolverAdapter } from "./adapters/github-release-resolver-adapter.js";
import { HasherAdapter } from "./adapters/hasher-adapter.js";
import { ManifestRepositoryAdapter } from "./adapters/manifest-repository-adapter.js";
import { PlatformAdapter } from "./adapters/platform-adapter.js";
import { PluginDistributionReaderAdapter } from "./adapters/plugin-distribution-reader-adapter.js";
import { InquirerPrompterAdapter, SilentPrompterAdapter } from "./adapters/prompter-adapter.js";
import { SelfUpdaterAdapter } from "./adapters/self-updater-adapter.js";
import { BundledAssetProviderAdapter } from "./assets/asset-loader.js";
import { AuthStorage } from "./auth/auth-storage.js";
import { HttpClient } from "./http/http-client.js";
import { userConfigDir } from "./user-config-dir.js";

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

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export interface FrameworkBuildContext {
  readonly target: string;
  readonly mode: string;
  readonly outDir: string;
  readonly force: boolean;
}

/** The subset of Deps the framework build pipeline reads — lets EnsureBuilt build any target. */
export type FrameworkBuildDeps = Pick<Deps, "fs" | "assetProvider" | "logger">;

type FrameworkBuildFactory = (
  deps: FrameworkBuildDeps,
  ctx: FrameworkBuildContext
) => FrameworkBuildUseCase;

function buildFrameworkUseCase(
  deps: FrameworkBuildDeps,
  makeStrategy: (
    deps: FrameworkBuildDeps,
    av: AjvSchemaValidatorAdapter
  ) => MarketplaceBuildStrategy | FlatBuildStrategy
): FrameworkBuildUseCase {
  const av = new AjvSchemaValidatorAdapter();
  return new FrameworkBuildUseCase(
    deps.fs,
    av,
    deps.assetProvider,
    deps.logger,
    makeStrategy(deps, av)
  );
}

/** One registry entry for a tool/mode pair whose profile declares that build contract. */
function frameworkBuildFactoryFor(
  buildContract: () => ToolBuildContract,
  mode: "marketplace" | "flat"
): FrameworkBuildFactory {
  if (mode === "marketplace") {
    return (deps) =>
      buildFrameworkUseCase(
        deps,
        (d, av) => new MarketplaceBuildStrategy(d.fs, av, d.assetProvider, buildContract())
      );
  }
  return (deps, ctx) =>
    buildFrameworkUseCase(
      deps,
      (d, av) =>
        new FlatBuildStrategy(
          d.fs,
          av,
          d.assetProvider,
          buildContract(),
          ctx.force,
          ctx.outDir,
          isDirectory,
          d.logger
        )
    );
}

/**
 * Derived from the registered tool profiles rather than listed by hand: a sixth tool
 * whose profile declares `buildContracts` needs no edit here. Follows the same shape
 * as `nativeActivationOf` — a declaration read off the profile — and must not diverge
 * from `FRAMEWORK_BUILD_TARGET_MODES`, the domain's source of truth for which
 * target/mode pairs exist.
 */
function frameworkBuildRegistryEntries(): (readonly [string, FrameworkBuildFactory])[] {
  const entries: (readonly [string, FrameworkBuildFactory])[] = [];
  for (const id of AI_TOOL_IDS) {
    for (const mode of ["marketplace", "flat"] as const) {
      const buildContract = buildContractFor(id, mode);
      if (buildContract === undefined) continue;
      entries.push([`${id}:${mode}`, frameworkBuildFactoryFor(buildContract, mode)]);
    }
  }
  return entries;
}

const FRAMEWORK_BUILD_REGISTRY: Record<string, FrameworkBuildFactory> = Object.fromEntries(
  frameworkBuildRegistryEntries()
);

export function createFrameworkBuildUseCase(
  deps: FrameworkBuildDeps,
  ctx: FrameworkBuildContext
): FrameworkBuildUseCase | undefined {
  const key = `${ctx.target}:${ctx.mode}`;
  const factory = FRAMEWORK_BUILD_REGISTRY[key];
  return factory?.(deps, ctx);
}

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
  const pluginCatalogRepository = new PluginCatalogRepositoryAdapter(fs);
  const pluginDistributionReader = new PluginDistributionReaderAdapter(fs);
  const marketplaceCache = new MarketplaceCacheAdapter(projectRoot);
  const marketplaceRegistry = new MarketplaceRegistryAdapter();
  const marketplaceTrustStore = new MarketplaceTrustStoreAdapter(hasher);
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
  const pluginFetcher = new PluginFetcherAdapter(fs, authReader);
  const rawCatalogFetcher = new GitHubRawFetcherAdapter(http, authReader);
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
  const nativePluginActivators = new Map<string, NativePluginActivator>([
    ...AI_TOOL_IDS.map((id) => {
      const activation = nativeActivationOf(id);
      return activation === undefined
        ? undefined
        : ([activation.binary, new NativePluginCliAdapter(activation.binary, activation)] as const);
    }).filter((entry): entry is NonNullable<typeof entry> => entry !== undefined),
  ]);
  const pluginRemoveUseCase = new PluginRemoveUseCase(fs, manifestRepo);
  const pluginListUseCase = new PluginListUseCase(manifestRepo);
  const fetchMarketplaceSource = new FetchMarketplaceSourceUseCase(
    pluginFetcher,
    rawCatalogFetcher,
    fs,
    logger
  );
  const resolveMarketplaceUseCase = new ResolveMarketplaceUseCase(
    fetchMarketplaceSource,
    pluginCatalogRepository
  );
  const marketplaceListUseCase = new MarketplaceListUseCase(
    marketplaceRegistry,
    resolveMarketplaceUseCase,
    logger
  );
  const marketplaceRemoveUseCase = new MarketplaceRemoveUseCase(
    fs,
    manifestRepo,
    marketplaceRegistry,
    prompter
  );
  const marketplaceAddUseCase = new MarketplaceAddUseCase(
    marketplaceRegistry,
    marketplaceTrustStore,
    resolveMarketplaceUseCase,
    prompter,
    marketplaceRemoveUseCase
  );
  const marketplaceRefreshUseCase = new MarketplaceRefreshUseCase(
    marketplaceRegistry,
    resolveMarketplaceUseCase,
    marketplaceCache,
    logger,
    fs
  );
  const marketplaceCheckUseCase = new MarketplaceCheckUseCase(
    manifestRepo,
    marketplaceRegistry,
    resolveMarketplaceUseCase
  );
  const assetProvider = new BundledAssetProviderAdapter();
  const jsonSchemaValidator = new AjvSchemaValidatorAdapter();
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
  const frameworkBuildUseCase = new FrameworkBuildUseCase(
    fs,
    jsonSchemaValidator,
    assetProvider,
    logger,
    new MarketplaceBuildStrategy(
      fs,
      jsonSchemaValidator,
      assetProvider,
      buildCopilotMarketplaceContract()
    )
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
  const marketplaceRegisterFrameworkUseCase = new MarketplaceRegisterFrameworkUseCase(
    marketplaceRegistry
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
