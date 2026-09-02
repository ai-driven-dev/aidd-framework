import { resolve } from "node:path";
// Register all tools so use-cases that call getToolConfig / getIdeToolConfig don't throw
import "../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import "../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import { PluginCatalogRepositoryAdapter } from "../../../src/contexts/distribution/infrastructure/plugin-catalog-repository-adapter.js";
import { DoctorLayoutUseCase } from "../../../src/contexts/framework/application/doctor/doctor-layout-use-case.js";
import { DoctorMergeFilesUseCase } from "../../../src/contexts/framework/application/doctor/doctor-merge-files-use-case.js";
import { DoctorPluginUseCase } from "../../../src/contexts/framework/application/doctor/doctor-plugin-use-case.js";
import { DoctorReferencesUseCase } from "../../../src/contexts/framework/application/doctor/doctor-references-use-case.js";
import { DoctorRegistrationUseCase } from "../../../src/contexts/framework/application/doctor/doctor-registration-use-case.js";
import { DoctorTrackedFilesUseCase } from "../../../src/contexts/framework/application/doctor/doctor-tracked-files-use-case.js";
import { DoctorUseCase } from "../../../src/contexts/framework/application/doctor/doctor-use-case.js";
import { MarketplaceSyncSettingsUseCase } from "../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import { GitignoreUseCase } from "../../../src/contexts/framework/application/gitignore-use-case.js";
import { ResolveUpdateDecisionUseCase } from "../../../src/contexts/framework/application/global/resolve-update-decision-use-case.js";
import { UpdateOneToolUseCase } from "../../../src/contexts/framework/application/global/update-one-tool-use-case.js";
import { InitUseCase } from "../../../src/contexts/framework/application/init-use-case.js";
import { InstallIdeConfigUseCase } from "../../../src/contexts/framework/application/install/install-ide-config-use-case.js";
import { InstallRuntimeConfigUseCase } from "../../../src/contexts/framework/application/install/install-runtime-config-use-case.js";
import { PostInstallPipelineUseCase } from "../../../src/contexts/framework/application/install/post-install-pipeline-use-case.js";
import { DetectPluginDriftUseCase } from "../../../src/contexts/framework/application/shared/detect-plugin-drift-use-case.js";
import { Manifest } from "../../../src/contexts/framework/domain/manifest.js";
import { PluginDistributionReaderAdapter } from "../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { isIdeToolId } from "../../../src/contexts/tools/domain/registry.js";
import { BundledAssetProviderAdapter } from "../../../src/infrastructure/assets/asset-loader.js";
import type { ToolId } from "../../../src/kernel/tool.js";
import { CLIOutput } from "../../../src/presentation/output.js";
import { SyncConflictResolverUseCase } from "../../../src/presentation/prompts/sync-conflict-resolver-use-case.js";
import { SilentPrompterAdapter } from "../../../src/runtime/prompter/prompter-adapter.js";
import { DeterministicHasher } from "./deterministic-hasher.js";
import { FakeCurrentVersion } from "./fake-current-version.js";
import { fakeEnsureBuiltMarketplace } from "./fake-ensure-built-marketplace.js";
import { FakeNativePluginActivator } from "./fake-native-plugin-activator.js";
import { FixturePluginFetcher } from "./fixture-plugin-fetcher.js";
import { InMemoryFileAdapter } from "./in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "./in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "./in-memory-marketplace-registry.js";
import { seedFromDirectory } from "./seed-from-directory.js";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/framework");

/**
 * Builds in-memory deps for use-case unit tests.
 * The InMemoryFileAdapter is pre-seeded with the framework fixture content (absolute paths).
 */
export async function buildUnitDeps(_projectRoot: string) {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter({}, hasher);
  const manifestRepo = new InMemoryManifestRepository();
  const logger = new CLIOutput(false);
  const assetProvider = new BundledAssetProviderAdapter();
  const pluginFetcher = new FixturePluginFetcher();
  const pluginDistributionReader = new PluginDistributionReaderAdapter(fs);
  const pluginCatalogRepository = new PluginCatalogRepositoryAdapter(fs);
  const marketplaceRegistry = new InMemoryMarketplaceRegistry();
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

  const currentVersionProvider = new FakeCurrentVersion();

  const syncConflictResolver = new SyncConflictResolverUseCase(fs);
  const marketplaceSyncSettings = new MarketplaceSyncSettingsUseCase(
    fs,
    manifestRepo,
    marketplaceRegistry,
    pluginCatalogRepository,
    hasher,
    logger,
    new Map([["codex", new FakeNativePluginActivator()]]),
    fakeEnsureBuiltMarketplace()
  );

  // Seed the framework fixture content so the install use-case can read it
  await seedFromDirectory(fs, FIXTURE_DIR, { useAbsolutePaths: true });

  return {
    hasher,
    fs,
    manifestRepo,
    logger,
    assetProvider,
    pluginFetcher,
    pluginDistributionReader,
    pluginCatalogRepository,
    marketplaceRegistry,
    marketplaceSyncSettings,
    installRuntimeConfigUseCase,
    installIdeConfigUseCase,
    gitignoreUseCase,
    postInstallPipelineUseCase,
    currentVersionProvider,
    syncConflictResolver,
  };
}

export async function initProject(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  projectRoot: string
): Promise<void> {
  const initUseCase = new InitUseCase(deps.fs, deps.manifestRepo);
  await initUseCase.execute({ projectRoot });
}

export async function installTool(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  projectRoot: string,
  toolId: ToolId
) {
  const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
  const version = "test";
  if (isIdeToolId(toolId)) {
    return deps.installIdeConfigUseCase.execute({
      toolId,
      projectRoot,
      manifest,
      force: false,
      version,
    });
  }
  return deps.installRuntimeConfigUseCase.execute({
    toolId,
    projectRoot,
    manifest,
    force: false,
    version,
  });
}

export async function initAndInstall(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  projectRoot: string,
  toolId: ToolId
) {
  await initProject(deps, projectRoot);
  return installTool(deps, projectRoot, toolId);
}

export function buildUpdateOneToolUseCase(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  prompter?: ConstructorParameters<typeof ResolveUpdateDecisionUseCase>[0]
): UpdateOneToolUseCase {
  const resolveUpdateDecision = new ResolveUpdateDecisionUseCase(
    prompter ?? new SilentPrompterAdapter()
  );
  return new UpdateOneToolUseCase(
    deps.installRuntimeConfigUseCase,
    deps.installIdeConfigUseCase,
    deps.syncConflictResolver,
    resolveUpdateDecision,
    deps.fs
  );
}

export function buildDoctorUseCase(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  authReader?: ConstructorParameters<typeof DoctorLayoutUseCase>[1]
): DoctorUseCase {
  return new DoctorUseCase(
    deps.manifestRepo,
    new DoctorTrackedFilesUseCase(deps.fs),
    new DoctorMergeFilesUseCase(deps.fs, deps.hasher),
    new DoctorPluginUseCase(new DetectPluginDriftUseCase(deps.fs)),
    new DoctorReferencesUseCase(deps.fs),
    new DoctorLayoutUseCase(deps.fs, authReader),
    new DoctorRegistrationUseCase(deps.fs, deps.marketplaceRegistry)
  );
}

export { FIXTURE_DIR };
