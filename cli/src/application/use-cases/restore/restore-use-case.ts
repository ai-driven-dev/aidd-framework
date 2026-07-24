import { join } from "node:path";
import {
  type ConfigRef,
  FRAMEWORK_CONFIG_PREFIX,
  FrameworkDescriptor,
} from "../../../domain/models/framework.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { AssetProvider } from "../../../domain/ports/asset-provider.js";
import type { FileMerger } from "../../../domain/ports/file-merger.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { Logger } from "../../../domain/ports/logger.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { Platform } from "../../../domain/ports/platform.js";
import type { PluginDistributionReader } from "../../../domain/ports/plugin-distribution-reader.js";
import type { PluginFetcher } from "../../../domain/ports/plugin-fetcher.js";
import type { Prompter } from "../../../domain/ports/prompter.js";
import type { ToolId } from "../../../domain/tools/registry.js";
import { NoManifestError } from "../../errors.js";
import type { BuiltMaterializationDeps } from "../shared/apply-plugin-files-use-case.js";
import {
  type RestoreAllPluginsResult,
  RestoreAllPluginsUseCase,
} from "./restore-all-plugins-use-case.js";
import {
  type RestoreToolFilesResult,
  RestoreToolFilesUseCase,
} from "./restore-tool-files-use-case.js";

const CONFIG_REFS: readonly ConfigRef[] = [
  { name: "mcp", path: `${FRAMEWORK_CONFIG_PREFIX}mcp.json` },
  { name: "vscodeExtensions", path: `${FRAMEWORK_CONFIG_PREFIX}vscode/extensions.json` },
  { name: "vscodeKeybindings", path: `${FRAMEWORK_CONFIG_PREFIX}vscode/keybindings.json` },
  { name: "vscodeSettings", path: `${FRAMEWORK_CONFIG_PREFIX}vscode/settings.json` },
  { name: "opencode", path: `${FRAMEWORK_CONFIG_PREFIX}.opencode/opencode.json` },
];

interface RestoreOptions {
  frameworkPath?: string;
  version?: string;
  docsDir?: string;
  projectRoot: string;
  toolIds?: ToolId[];
  files?: string[];
  force?: boolean;
  interactive?: boolean;
  manifest?: Manifest;
  pluginName?: string;
}

interface RestoreCtx {
  manifest: Manifest;
  descriptor: FrameworkDescriptor;
  contentFiles: Map<string, string>;
  docsDir: string;
  projectRoot: string;
  version: string;
  force: boolean;
  interactive: boolean;
  fileFilter: ((p: string) => boolean) | null;
  toolIds: ToolId[];
  pluginName?: string;
}

interface RestoreResult {
  tools: RestoreToolFilesResult[];
  totalRestored: number;
  totalKept: number;
  totalPluginFilesRestored: number;
  restoredPluginNames: string[];
}

export class RestoreUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter & FileMerger,
    private readonly manifestRepo: ManifestRepository,
    private readonly hasher: Hasher,
    private readonly logger: Logger,
    private readonly platform: Platform,
    private readonly prompter: Prompter,
    private readonly pluginFetcher?: PluginFetcher,
    private readonly pluginDistributionReader?: PluginDistributionReader,
    private readonly assetProvider?: AssetProvider,
    private readonly builtDeps?: BuiltMaterializationDeps
  ) {}

  async execute(options: RestoreOptions): Promise<RestoreResult> {
    const manifest = options.manifest ?? (await this.manifestRepo.load());
    if (manifest === null) throw new NoManifestError();
    const ctx = await this.buildRestoreContext(options, manifest);
    return this.executeRestore(ctx);
  }

  private async buildRestoreContext(
    options: RestoreOptions,
    manifest: Manifest
  ): Promise<RestoreCtx> {
    const resolvedVersion = options.version ?? "unknown";
    return {
      manifest,
      descriptor: this.buildStaticDescriptor(resolvedVersion),
      contentFiles: options.frameworkPath
        ? await this.buildContentFiles(options.frameworkPath)
        : new Map(),
      docsDir: options.docsDir ?? "",
      projectRoot: options.projectRoot,
      version: resolvedVersion,
      force: options.force ?? false,
      interactive: options.interactive ?? false,
      fileFilter: buildFileFilter(options.files),
      toolIds: options.toolIds?.length ? options.toolIds : manifest.getInstalledToolIds(),
      pluginName: options.pluginName,
    };
  }

  private async executeRestore(ctx: RestoreCtx): Promise<RestoreResult> {
    const toolResults = await this.runToolRestores(ctx);
    const pluginResult = await this.runPluginRestore(ctx);
    await this.saveIfChanged(toolResults, pluginResult.totalFiles, ctx.manifest);
    return this.buildTotals(toolResults, pluginResult);
  }

  private async runToolRestores(ctx: RestoreCtx): Promise<RestoreToolFilesResult[]> {
    const toolUseCase = new RestoreToolFilesUseCase(
      this.fs,
      this.hasher,
      this.logger,
      this.platform,
      this.prompter,
      this.assetProvider
    );
    const results: RestoreToolFilesResult[] = [];
    for (const toolId of ctx.toolIds) {
      results.push(await toolUseCase.execute({ toolId, ...ctx }));
    }
    return results;
  }

  private async runPluginRestore(ctx: RestoreCtx): Promise<RestoreAllPluginsResult> {
    if (this.pluginFetcher === undefined || this.pluginDistributionReader === undefined) {
      return { totalFiles: 0, pluginNames: [] };
    }
    return new RestoreAllPluginsUseCase(
      this.fs,
      this.hasher,
      this.pluginFetcher,
      this.pluginDistributionReader,
      this.builtDeps
    ).execute({
      projectRoot: ctx.projectRoot,
      manifest: ctx.manifest,
      docsDir: ctx.docsDir,
      fileFilter: ctx.fileFilter,
      pluginName: ctx.pluginName,
      toolIds: ctx.toolIds,
    });
  }

  private async saveIfChanged(
    toolResults: RestoreToolFilesResult[],
    totalPluginFilesRestored: number,
    manifest: Manifest
  ): Promise<void> {
    const hasChanges =
      toolResults.some((t) => t.restored.length > 0) || totalPluginFilesRestored > 0;
    if (hasChanges) await this.manifestRepo.save(manifest);
  }

  private buildTotals(
    toolResults: RestoreToolFilesResult[],
    pluginResult: RestoreAllPluginsResult
  ): RestoreResult {
    return {
      tools: toolResults,
      totalRestored: toolResults.reduce((s, t) => s + t.restored.length, 0),
      totalKept: toolResults.reduce((s, t) => s + t.kept.length, 0),
      totalPluginFilesRestored: pluginResult.totalFiles,
      restoredPluginNames: pluginResult.pluginNames,
    };
  }

  private buildStaticDescriptor(version: string): FrameworkDescriptor {
    return new FrameworkDescriptor({
      version,
      contentSections: [],
      templateRefs: [],
      configRefs: [...CONFIG_REFS],
    });
  }

  private async buildContentFiles(frameworkPath: string): Promise<Map<string, string>> {
    const contentFiles = new Map<string, string>();
    for (const ref of CONFIG_REFS) {
      const absPath = join(frameworkPath, ref.path);
      if (await this.fs.fileExists(absPath)) {
        contentFiles.set(ref.path, await this.fs.readFile(absPath));
      }
    }
    return contentFiles;
  }
}

function buildFileFilter(files: string[] | undefined): ((p: string) => boolean) | null {
  if (!files || files.length === 0) return null;
  return (relativePath: string) =>
    files.some((entry) => {
      const basename = entry.split("/").at(-1) ?? entry;
      const isDirectoryPrefix = entry.endsWith("/") || !basename.includes(".");
      if (isDirectoryPrefix) {
        const prefix = entry.endsWith("/") ? entry : `${entry}/`;
        return relativePath.startsWith(prefix);
      }
      return relativePath === entry;
    });
}
