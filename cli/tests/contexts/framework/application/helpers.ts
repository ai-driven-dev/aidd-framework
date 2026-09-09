import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import "../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import { PluginCatalogRepositoryAdapter } from "../../../../src/contexts/distribution/infrastructure/plugin-catalog-repository-adapter.js";
import { PluginFetcherAdapter } from "../../../../src/contexts/distribution/infrastructure/plugin-fetcher-adapter.js";
import { GitignoreUseCase } from "../../../../src/contexts/framework/application/gitignore-use-case.js";
import { InitUseCase } from "../../../../src/contexts/framework/application/init-use-case.js";
import { InstallIdeConfigUseCase } from "../../../../src/contexts/framework/application/install/install-ide-config-use-case.js";
import { InstallRuntimeConfigUseCase } from "../../../../src/contexts/framework/application/install/install-runtime-config-use-case.js";
import { PostInstallPipelineUseCase } from "../../../../src/contexts/framework/application/install/post-install-pipeline-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { ManifestRepositoryAdapter } from "../../../../src/contexts/framework/infrastructure/manifest-repository-adapter.js";
import { PluginDistributionReaderAdapter } from "../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import type { VersionControl } from "../../../../src/contexts/telemetry/domain/ports/version-control.js";
import { isIdeToolId } from "../../../../src/contexts/tools/domain/registry.js";
import type { Prompter } from "../../../../src/kernel/ports/prompter.js";
import type { VersionReader } from "../../../../src/kernel/ports/version-reader.js";
import type { ToolId } from "../../../../src/kernel/tool.js";
import { CLIOutput } from "../../../../src/presentation/output.js";
import { BundledAssetProviderAdapter } from "../../../../src/runtime/assets/asset-loader.js";
import { FileAdapter } from "../../../../src/runtime/filesystem/file-adapter.js";
import { HasherAdapter } from "../../../../src/runtime/filesystem/hasher-adapter.js";
import type { Platform } from "../../../../src/runtime/platform/platform.js";
import { SilentPrompterAdapter } from "../../../../src/runtime/prompter/prompter-adapter.js";
import { CurrentVersionAdapter } from "../../../../src/runtime/self-update/current-version-adapter.js";
export const linuxPlatform: Platform = { current: () => "linux" };
export const win32Platform: Platform = { current: () => "win32" };
export const noGit: VersionControl = {
  installCommitMessageDelegate: async () => ({ lineAdded: false }),
  removeCommitMessageDelegate: async () => ({ removed: false }),
  listTrackedFiles: async () => [],
  isRepository: async () => false,
  hasHistoryFor: async () => false,
  readCommitTrailerSetup: async () => ({
    delegate: "absent",
    callSite: "no-hook-file",
    hookHasOtherContent: false,
  }),
};

export const OverwritePrompter = SilentPrompterAdapter;

export class KeepPrompter implements Prompter {
  async resolveConflict(
    _relativePath: string,
    _reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite"> {
    return "keep";
  }

  async resolveConflictBulk(
    _relativePath: string,
    _reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite" | "overwrite-all" | "skip-all"> {
    return "keep";
  }

  async confirm(_message: string): Promise<boolean> {
    return true;
  }

  async input(_message: string, defaultValue?: string): Promise<string> {
    return defaultValue ?? "";
  }

  async select<T>(
    _message: string,
    choices: Array<{ name: string; value: T; disabled?: boolean }>
  ): Promise<T> {
    const first = choices.find((c) => !c.disabled);
    if (first === undefined) {
      throw new Error("No enabled choices available");
    }
    return first.value;
  }

  async checkbox<T>(
    _message: string,
    choices: Array<{ name: string; value: T; checked?: boolean; disabled?: boolean | string }>
  ): Promise<T[]> {
    return choices.filter((c) => c.checked === true && !c.disabled).map((c) => c.value);
  }
}

abstract class QueuedSelectPrompter implements Prompter {
  private readonly selectQueue: string[];
  private selectIdx = 0;

  constructor(selectQueue: string[]) {
    this.selectQueue = selectQueue;
  }

  abstract resolveConflict(
    relativePath: string,
    reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite">;

  async resolveConflictBulk(
    _relativePath: string,
    _reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite" | "overwrite-all" | "skip-all"> {
    return "overwrite";
  }

  async confirm(_message: string): Promise<boolean> {
    return true;
  }

  async input(_message: string, defaultValue?: string): Promise<string> {
    return defaultValue ?? "";
  }

  async select<T>(
    _message: string,
    choices: Array<{ name: string; value: T; disabled?: boolean }>
  ): Promise<T> {
    const response =
      this.selectQueue[this.selectIdx] ?? this.selectQueue[this.selectQueue.length - 1];
    this.selectIdx++;
    const match = choices.find((c) => !c.disabled && String(c.value) === response);
    if (match === undefined)
      throw new Error(`${this.constructor.name}: no match for "${response}" in choices`);
    return match.value;
  }

  async checkbox<T>(
    _message: string,
    choices: Array<{ name: string; value: T; checked?: boolean; disabled?: boolean | string }>
  ): Promise<T[]> {
    return choices.filter((c) => c.checked === true && !c.disabled).map((c) => c.value);
  }
}

export class SkipPrompter extends QueuedSelectPrompter {
  constructor() {
    super(["global", "skip all"]);
  }

  async resolveConflict(
    _relativePath: string,
    _reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite"> {
    return "keep";
  }
}

export class BackupPrompter extends QueuedSelectPrompter {
  constructor() {
    super(["global", "backup all"]);
  }

  async resolveConflict(
    _relativePath: string,
    _reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite"> {
    return "overwrite";
  }
}

export class RecordingPrompter implements Prompter {
  readonly calls: Array<{ relativePath: string; reason: "deleted" | "modified" }> = [];
  private readonly response: "keep" | "overwrite";

  constructor(response: "keep" | "overwrite" = "overwrite") {
    this.response = response;
  }

  async resolveConflict(
    relativePath: string,
    reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite"> {
    this.calls.push({ relativePath, reason });
    return this.response;
  }

  async resolveConflictBulk(
    _relativePath: string,
    _reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite" | "overwrite-all" | "skip-all"> {
    return this.response;
  }

  async confirm(_message: string): Promise<boolean> {
    return true;
  }

  async input(_message: string, defaultValue?: string): Promise<string> {
    return defaultValue ?? "";
  }

  async select<T>(
    _message: string,
    choices: Array<{ name: string; value: T; disabled?: boolean }>
  ): Promise<T> {
    const first = choices.find((c) => !c.disabled);
    if (first === undefined) {
      throw new Error("No enabled choices available");
    }
    return first.value;
  }

  async checkbox<T>(
    _message: string,
    choices: Array<{ name: string; value: T; checked?: boolean; disabled?: boolean | string }>
  ): Promise<T[]> {
    return choices.filter((c) => c.checked === true && !c.disabled).map((c) => c.value);
  }
}

export const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/framework");
export const FIXTURE_DIR_V2 = join(process.cwd(), "tests/fixtures/framework-v2");

export function buildDeps(projectRoot: string) {
  const hasher = new HasherAdapter();
  const fs = new FileAdapter(hasher);
  const manifestRepo = new ManifestRepositoryAdapter(projectRoot);
  const logger = new CLIOutput(false);
  const assetProvider = new BundledAssetProviderAdapter();
  const pluginFetcher = new PluginFetcherAdapter(fs);
  const pluginDistributionReader = new PluginDistributionReaderAdapter(fs);
  const pluginCatalogRepository = new PluginCatalogRepositoryAdapter(fs);
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
  const currentVersionProvider: VersionReader = new CurrentVersionAdapter();
  return {
    hasher,
    fs,
    manifestRepo,
    logger,
    assetProvider,
    pluginFetcher,
    pluginDistributionReader,
    pluginCatalogRepository,
    installRuntimeConfigUseCase,
    installIdeConfigUseCase,
    currentVersionProvider,
  };
}

export async function createTempProject(): Promise<{ tempDir: string; projectRoot: string }> {
  const tempDir = await mkdtemp(join(tmpdir(), "aidd-test-"));
  const projectRoot = join(tempDir, "project");
  await mkdir(projectRoot, { recursive: true });
  return { tempDir, projectRoot };
}

export async function cleanupTempProject(tempDir: string): Promise<void> {
  await rm(tempDir, { recursive: true, force: true });
}

export async function initProject(
  deps: ReturnType<typeof buildDeps>,
  projectRoot: string
): Promise<void> {
  const initUseCase = new InitUseCase(deps.fs, deps.manifestRepo);
  await initUseCase.execute({
    projectRoot,
  });
}

export async function installTool(
  deps: ReturnType<typeof buildDeps>,
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
  deps: ReturnType<typeof buildDeps>,
  projectRoot: string,
  toolId: ToolId
) {
  await initProject(deps, projectRoot);
  return installTool(deps, projectRoot, toolId);
}
