import { DOCS_DIR } from "../../../domain/models/paths.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { Prompter } from "../../../domain/ports/prompter.js";
import { NoManifestError } from "../../errors.js";
import type { RestoreUseCase } from "../restore/restore-use-case.js";
import type { StatusUseCase } from "../status-use-case.js";
import type { GlobalExecutionError } from "./update-all-use-case.js";

export interface RestoreAllResult {
  totalRestored: number;
  totalKept: number;
  pluginNamesRestored: string[];
  errors: GlobalExecutionError[];
}

export class RestoreAllUseCase {
  constructor(
    private readonly manifestRepo: ManifestRepository,
    private readonly prompter: Prompter,
    private readonly statusUseCase: StatusUseCase,
    private readonly restoreUseCase: RestoreUseCase
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

    return {
      totalRestored: restoreResult.totalRestored,
      totalKept: restoreResult.totalKept,
      pluginNamesRestored: restoreResult.restoredPluginNames,
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
    const report = await this.statusUseCase.execute({ projectRoot });
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
  ): Promise<{ totalRestored: number; totalKept: number; restoredPluginNames: string[] }> {
    try {
      if (manifest === null) return { totalRestored: 0, totalKept: 0, restoredPluginNames: [] };
      const result = await this.restoreUseCase.execute({
        version,
        docsDir: DOCS_DIR,
        projectRoot,
        files,
        force: interactive,
        interactive,
        manifest,
      });
      return {
        totalRestored: result.totalRestored,
        totalKept: result.totalKept,
        restoredPluginNames: result.restoredPluginNames,
      };
    } catch (err) {
      errors.push({
        scope: "config-restore",
        message: err instanceof Error ? err.message : String(err),
      });
      return { totalRestored: 0, totalKept: 0, restoredPluginNames: [] };
    }
  }
}
