import { CategoryMismatchError } from "../../../../kernel/errors.js";
import type { AiToolId, IdeToolId, ToolId } from "../../../../kernel/tool.js";
import { AI_TOOL_IDS } from "../../../../kernel/tool.js";
import { getToolConfig, isAiTool } from "../../../tools/domain/registry.js";
import { Manifest } from "../../domain/manifest.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type {
  InstallIdeConfigResult,
  InstallIdeConfigUseCase,
} from "../install/install-ide-config-use-case.js";
import type {
  InstallRuntimeConfigResult,
  InstallRuntimeConfigUseCase,
} from "../install/install-runtime-config-use-case.js";

export type ToolInstallResult = InstallRuntimeConfigResult | InstallIdeConfigResult;

export interface SetupToolsOptions {
  projectRoot: string;
  aiTools: readonly ToolId[];
  ideTools: readonly ToolId[];
  force: boolean;
  version: string;
}

export interface SetupToolsResult {
  results: ToolInstallResult[];
}

export class SetupToolsUseCase {
  constructor(
    private readonly manifestRepo: ManifestRepository,
    private readonly installRuntimeConfigUseCase: InstallRuntimeConfigUseCase,
    private readonly installIdeConfigUseCase: InstallIdeConfigUseCase
  ) {}

  async execute(options: SetupToolsOptions): Promise<SetupToolsResult> {
    if (options.aiTools.length === 0 && options.ideTools.length === 0) {
      return { results: [] };
    }
    const manifest = (await this.manifestRepo.load()) ?? Manifest.create();
    const results: ToolInstallResult[] = [];
    for (const toolId of options.ideTools) {
      results.push(await this.installIdeTool(toolId as IdeToolId, manifest, options));
    }
    for (const toolId of options.aiTools) {
      results.push(await this.installAiTool(toolId as AiToolId, manifest, options));
    }
    return { results };
  }

  private async installAiTool(
    toolId: AiToolId,
    manifest: Manifest,
    options: SetupToolsOptions
  ): Promise<InstallRuntimeConfigResult> {
    const config = getToolConfig(toolId);
    if (!isAiTool(config)) throw new CategoryMismatchError([toolId], "ai", AI_TOOL_IDS);
    return this.installRuntimeConfigUseCase.execute({
      toolId,
      projectRoot: options.projectRoot,
      manifest,
      force: options.force,
      version: options.version,
    });
  }

  private async installIdeTool(
    toolId: IdeToolId,
    manifest: Manifest,
    options: SetupToolsOptions
  ): Promise<InstallIdeConfigResult> {
    return this.installIdeConfigUseCase.execute({
      toolId,
      projectRoot: options.projectRoot,
      manifest,
      force: options.force,
      version: options.version,
    });
  }
}
