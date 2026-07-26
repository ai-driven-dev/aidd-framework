import { DOCS_DIR } from "../../../domain/models/paths.js";
import type { AiToolId } from "../../../domain/models/tool-ids.js";
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
import { NoManifestError } from "../../errors.js";
import { RestorePluginUseCase } from "../restore/restore-plugin-use-case.js";
import { RestoreUseCase } from "../restore/restore-use-case.js";
import type { BuiltMaterializationDeps } from "../shared/apply-plugin-files-use-case.js";
import { StatusUseCase } from "../status-use-case.js";
import type { GlobalExecutionError } from "./update-all-use-case.js";

export interface RestoreAllResult {
  totalRestored: number;
  totalKept: number;
  pluginNamesRestored: string[];
  errors: GlobalExecutionError[];
}

export class RestoreAllUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter & FileMerger,
    private readonly manifestRepo: ManifestRepository,
    private readonly hasher: Hasher,
    private readonly logger: Logger,
    private readonly platform: Platform,
    private readonly prompter: Prompter,
    private readonly pluginFetcher: PluginFetcher,
    private readonly pluginDistributionReader: PluginDistributionReader,
    private readonly assetProvider?: AssetProvider,
    private readonly builtDeps?: BuiltMaterializationDeps
  ) {}

  async execute(projectRoot: string, interactive: boolean): Promise<RestoreAllResult> {
    const errors: GlobalExecutionError[] = [];
    const manifest = await this.manifestRepo.load();
    if (manifest === null) throw new NoManifestError();

    const effectiveFiles = interactive ? await this.promptForFiles(projectRoot) : undefined;
    const version = this.resolveVersion(manifest);
    const restoreResult = await this.runConfigRestore(
      projectRoot,
      version,
      effectiveFiles,
      interactive,
      manifest,
      errors
    );
    const pluginNames = await this.restoreAllPlugins(projectRoot, manifest, errors);

    return {
      totalRestored: restoreResult.totalRestored,
      totalKept: restoreResult.totalKept,
      pluginNamesRestored: pluginNames,
      errors,
    };
  }

  private resolveVersion(manifest: ReturnType<typeof Object.create>): string {
    return (
      manifest
        .getInstalledToolIds()
        .map((id: string) => manifest.getToolVersion(id))
        .find((v: string | undefined) => v !== undefined) ?? "unknown"
    );
  }

  private async promptForFiles(projectRoot: string): Promise<string[] | undefined> {
    const statusUseCase = new StatusUseCase(this.fs, this.manifestRepo, this.hasher);
    const report = await statusUseCase.execute({ projectRoot });
    const driftedFiles = report.tools.flatMap((t) =>
      t.drifted
        .filter((d) => d.status === "modified" || d.status === "deleted")
        .map((d) => d.relativePath)
    );
    if (driftedFiles.length === 0) return [];
    const selected = await this.prompter.checkbox(
      "Select files to restore:",
      driftedFiles.map((f) => ({ name: f, value: f }))
    );
    return selected.length === 0 ? [] : selected;
  }

  private async runConfigRestore(
    projectRoot: string,
    version: string,
    files: string[] | undefined,
    interactive: boolean,
    manifest: Awaited<ReturnType<ManifestRepository["load"]>>,
    errors: GlobalExecutionError[]
  ): Promise<{ totalRestored: number; totalKept: number }> {
    try {
      const restoreUseCase = new RestoreUseCase(
        this.fs,
        this.manifestRepo,
        this.hasher,
        this.logger,
        this.platform,
        this.prompter,
        this.pluginFetcher,
        this.pluginDistributionReader,
        this.assetProvider,
        this.builtDeps
      );
      if (manifest === null) return { totalRestored: 0, totalKept: 0 };
      const result = await restoreUseCase.execute({
        version,
        docsDir: DOCS_DIR,
        projectRoot,
        files,
        force: interactive,
        interactive,
        manifest,
      });
      return { totalRestored: result.totalRestored, totalKept: result.totalKept };
    } catch (err) {
      errors.push({
        scope: "config-restore",
        message: err instanceof Error ? err.message : String(err),
      });
      return { totalRestored: 0, totalKept: 0 };
    }
  }

  private async restoreAllPlugins(
    projectRoot: string,
    manifest: NonNullable<Awaited<ReturnType<ManifestRepository["load"]>>>,
    errors: GlobalExecutionError[]
  ): Promise<string[]> {
    const restored: string[] = [];
    const restorePluginUseCase = new RestorePluginUseCase(
      this.fs,
      this.manifestRepo,
      this.pluginFetcher,
      this.pluginDistributionReader,
      this.hasher,
      this.builtDeps
    );
    const allPluginNames = this.collectAllPluginNames(manifest);
    for (const name of allPluginNames) {
      try {
        await restorePluginUseCase.execute({ pluginName: name, projectRoot });
        restored.push(name);
      } catch (err) {
        errors.push({
          scope: `plugin:${name}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return restored;
  }

  private collectAllPluginNames(
    manifest: NonNullable<Awaited<ReturnType<ManifestRepository["load"]>>>
  ): string[] {
    const names = new Set<string>();
    for (const toolId of manifest.getInstalledToolIds()) {
      for (const plugin of manifest.getPlugins(toolId as AiToolId)) {
        names.add(plugin.name);
      }
    }
    return [...names];
  }
}
