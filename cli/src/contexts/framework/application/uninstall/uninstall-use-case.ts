import {
  InputRequiredError,
  NoManifestError,
  ToolNotInstalledError,
} from "../../../../application/errors.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { ToolId } from "../../../../kernel/tool.js";
import { VALID_TOOL_IDS } from "../../../../kernel/tool.js";
import type { Manifest } from "../../domain/manifest.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import { UninstallToolsUseCase } from "../install/uninstall-tools-use-case.js";
import { UninstallMcpExclusionUseCase } from "./uninstall-mcp-exclusion-use-case.js";
import { UninstallPluginUseCase } from "./uninstall-plugin-use-case.js";

interface UninstallOptions {
  toolIds: ToolId[];
  projectRoot: string;
  mcpFilter: string[];
  pluginName?: string;
}

interface UninstallToolResult {
  toolId: ToolId;
  fileCount: number;
  deletedFiles: string[];
}

export class UninstallUseCase {
  private readonly pluginUninstall: UninstallPluginUseCase;
  private readonly toolsUninstall: UninstallToolsUseCase;
  private readonly mcpExclusion: UninstallMcpExclusionUseCase;

  constructor(
    fs: FileReader & FileWriter,
    private readonly manifestRepo: ManifestRepository,
    logger: Logger
  ) {
    this.pluginUninstall = new UninstallPluginUseCase(fs, manifestRepo);
    this.toolsUninstall = new UninstallToolsUseCase(fs, logger);
    this.mcpExclusion = new UninstallMcpExclusionUseCase(fs, logger);
  }

  async execute(options: UninstallOptions): Promise<UninstallToolResult[]> {
    const { toolIds, projectRoot, mcpFilter, pluginName } = options;

    if (pluginName !== undefined) {
      return this.pluginUninstall.execute({ pluginName, toolIds, projectRoot });
    }

    if (toolIds.length === 0) {
      throw new InputRequiredError(
        `At least one tool ID is required. Valid tools: ${VALID_TOOL_IDS.join(", ")}`
      );
    }

    const manifest = await this.loadAndValidate(toolIds);

    const results =
      mcpFilter.length > 0
        ? await this.runMcpExclusions(toolIds, manifest, projectRoot, mcpFilter)
        : await this.toolsUninstall.execute({ toolIds, manifest, projectRoot });

    await this.manifestRepo.save(manifest);
    return results;
  }

  private async loadAndValidate(toolIds: ToolId[]): Promise<Manifest> {
    const manifest = await this.manifestRepo.load();
    if (manifest === null) throw new NoManifestError();
    for (const toolId of toolIds) {
      if (!manifest.hasTool(toolId)) throw new ToolNotInstalledError(toolId);
    }
    return manifest;
  }

  private async runMcpExclusions(
    toolIds: ToolId[],
    manifest: Manifest,
    projectRoot: string,
    mcpFilter: string[]
  ): Promise<UninstallToolResult[]> {
    const results: UninstallToolResult[] = [];
    for (const toolId of toolIds) {
      results.push(await this.mcpExclusion.execute({ toolId, manifest, projectRoot, mcpFilter }));
    }
    return results;
  }
}
