import { join } from "node:path";
import type { InstallIdeConfigUseCase } from "../../../contexts/tools/application/install-ide-config-use-case.js";
import type { InstallRuntimeConfigUseCase } from "../../../contexts/tools/application/install-runtime-config-use-case.js";
import { getToolConfig, isAiTool } from "../../../contexts/tools/domain/registry.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { FileHash } from "../../../kernel/file.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { AiToolId, IdeToolId, ToolId } from "../../../kernel/tool.js";
import { InputRequiredError } from "../../errors.js";
import type { SyncConflictResolverUseCase } from "../sync/sync-conflict-resolver-use-case.js";
import type {
  BulkConflictState,
  ResolveUpdateDecisionUseCase,
} from "./resolve-update-decision-use-case.js";

export interface GlobalExecutionError {
  scope: string;
  message: string;
}

export interface UpdateOneToolOptions {
  userForce: boolean;
  interactive: boolean;
  bulkState: BulkConflictState;
}

export class UpdateOneToolUseCase {
  constructor(
    private readonly installRuntimeConfigUseCase: InstallRuntimeConfigUseCase,
    private readonly installIdeConfigUseCase: InstallIdeConfigUseCase,
    private readonly conflictResolver: SyncConflictResolverUseCase,
    private readonly decisionUseCase: ResolveUpdateDecisionUseCase,
    private readonly fs: FileReader
  ) {}

  async execute(
    toolId: ToolId,
    manifest: Manifest,
    projectRoot: string,
    version: string,
    errors: GlobalExecutionError[],
    options: UpdateOneToolOptions
  ): Promise<{ toolId: ToolId; fileCount: number } | null> {
    const fileHashMap = this.buildManifestHashMap(manifest, toolId);
    const onBeforeWrite = this.buildFileGuard(fileHashMap, projectRoot, options);
    // @policy report-and-continue: one tool failing must not abort a batch update.
    // Failures are surfaced via the `errors` channel, which every caller prints.
    // InputRequiredError is the exception: it means a prompt is needed and the run
    // cannot proceed unattended, so it propagates and stops the batch.
    try {
      return await this.runInstall(toolId, manifest, projectRoot, version, onBeforeWrite);
    } catch (err) {
      if (err instanceof InputRequiredError) throw err;
      errors.push({ scope: toolId, message: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  private buildManifestHashMap(manifest: Manifest, toolId: ToolId): Map<string, FileHash> {
    const map = new Map<string, FileHash>();
    for (const f of manifest.getToolFiles(toolId)) {
      map.set(f.relativePath, f.hash);
    }
    return map;
  }

  private buildFileGuard(
    fileHashMap: Map<string, FileHash>,
    projectRoot: string,
    options: UpdateOneToolOptions
  ): (relativePath: string) => Promise<"write" | "skip"> {
    return async (relativePath: string) => {
      const diskPath = join(projectRoot, relativePath);
      const manifestHash = fileHashMap.get(relativePath);
      const isModified = await this.conflictResolver.isConflict(
        diskPath,
        await this.fs.fileExists(diskPath),
        relativePath,
        manifestHash !== undefined ? new Map([[relativePath, manifestHash]]) : new Map()
      );
      if (!isModified) return "write";
      const shouldWrite = await this.decisionUseCase.execute({
        relativePath,
        userForce: options.userForce,
        interactive: options.interactive,
        bulkState: options.bulkState,
      });
      return shouldWrite ? "write" : "skip";
    };
  }

  private async runInstall(
    toolId: ToolId,
    manifest: Manifest,
    projectRoot: string,
    version: string,
    onBeforeWriteRegularFile: (relativePath: string) => Promise<"write" | "skip">
  ): Promise<{ toolId: ToolId; fileCount: number } | null> {
    const config = getToolConfig(toolId);
    const result = isAiTool(config)
      ? await this.installRuntimeConfigUseCase.execute({
          toolId: toolId as AiToolId,
          projectRoot,
          manifest,
          force: true,
          version,
          onBeforeWriteRegularFile,
        })
      : await this.installIdeConfigUseCase.execute({
          toolId: toolId as IdeToolId,
          projectRoot,
          manifest,
          force: true,
          version,
          onBeforeWriteRegularFile,
        });
    if (result.skipped) return null;
    return { toolId, fileCount: result.fileCount };
  }
}
