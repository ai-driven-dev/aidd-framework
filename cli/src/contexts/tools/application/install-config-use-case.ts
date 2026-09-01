import type { ConfigCapability } from "../../../domain/models/config-capability.js";
import type { ConfigRef } from "../../../domain/models/framework.js";
import { CONFIG_MCP } from "../../../domain/models/framework.js";
import type { Platform } from "../../../domain/ports/platform.js";
import { InstallationFile } from "../../../kernel/file.js";
import type { MergeStrategy } from "../../../kernel/merge.js";
import type { AssetProvider } from "../../../kernel/ports/asset-provider.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { Hasher } from "../../../kernel/ports/hasher.js";
import type { AiToolId } from "../../../kernel/tool.js";
import { McpCapability } from "../domain/mcp-capability.js";
import { transformFor as transformMcpForPlatform } from "../domain/mcp-exclusion.js";
import { SettingsCapability } from "../domain/settings-capability.js";

interface InstallConfigOptions {
  capabilities: readonly ConfigCapability[];
  configRefs: readonly ConfigRef[];
  contentFiles: Map<string, string>;
  projectRoot: string;
  platform: Platform;
  assetProvider?: AssetProvider;
  toolId?: AiToolId;
}

export class InstallConfigUseCase {
  constructor(
    private readonly fs: FileReader,
    private readonly hasher: Hasher
  ) {}

  async execute(options: InstallConfigOptions): Promise<InstallationFile[]> {
    const { capabilities, configRefs, contentFiles, projectRoot, platform } = options;
    const win32Transform = transformMcpForPlatform(platform.current());
    const results: InstallationFile[] = [];
    for (const ref of configRefs) {
      const capability = capabilities.find((c) => c.consumes.includes(ref.name));
      if (capability === undefined) continue;
      const file = await this.processRef(
        ref,
        capability,
        contentFiles,
        projectRoot,
        win32Transform
      );
      if (file !== null) results.push(file);
    }
    for (const capability of capabilities) {
      if (!(capability instanceof SettingsCapability)) continue;
      const file = await this.processStaticCapability(capability, projectRoot, options);
      if (file !== null) results.push(file);
    }
    return results;
  }

  private async processRef(
    ref: ConfigRef,
    capability: ConfigCapability,
    contentFiles: Map<string, string>,
    projectRoot: string,
    win32Transform: ((content: string) => string) | undefined
  ): Promise<InstallationFile | null> {
    const rawContent = contentFiles.get(ref.path);
    if (rawContent === undefined) return null;
    const outputPath = await this.resolveCapabilityOutputPath(capability, projectRoot);
    if (outputPath === null) return null;
    const content = this.applyTransforms(capability, ref.name, rawContent, win32Transform);
    return new InstallationFile({
      relativePath: outputPath,
      content,
      hash: this.hasher.hash(content),
      mergeStrategy: this.getCapabilityMergeStrategy(capability),
      frameworkPath: ref.path,
    });
  }

  private async processStaticCapability(
    capability: SettingsCapability,
    projectRoot: string,
    options: InstallConfigOptions
  ): Promise<InstallationFile | null> {
    const content = this.resolveStaticContent(capability, options);
    if (content === null) return null;
    const outputPath = await this.resolveCapabilityOutputPath(capability, projectRoot);
    if (outputPath === null) return null;
    return new InstallationFile({
      relativePath: outputPath,
      content,
      hash: this.hasher.hash(content),
      mergeStrategy: capability.getMergeStrategy(),
    });
  }

  private resolveStaticContent(
    capability: SettingsCapability,
    options: InstallConfigOptions
  ): string | null {
    if (capability.staticContent !== undefined) return capability.staticContent;
    if (capability.staticContentAssetFile !== undefined) {
      if (options.assetProvider === undefined || options.toolId === undefined) return null;
      const asset = options.assetProvider.loadConfigAsset(
        options.toolId,
        capability.staticContentAssetFile
      );
      return typeof asset === "string" ? asset : JSON.stringify(asset, null, 2);
    }
    return null;
  }

  private async resolveCapabilityOutputPath(
    capability: ConfigCapability,
    projectRoot: string
  ): Promise<string | null> {
    if (capability instanceof McpCapability) {
      return capability.resolveOutput(projectRoot, this.fs);
    }
    return capability.buildOutputPath();
  }

  private applyTransforms(
    capability: ConfigCapability,
    configName: string,
    rawContent: string,
    win32Transform: ((content: string) => string) | undefined
  ): string {
    const toolContent =
      capability instanceof McpCapability ? capability.transform(rawContent) : rawContent;
    const isMcp = capability.consumes.includes(CONFIG_MCP) && configName === CONFIG_MCP;
    return isMcp && win32Transform ? win32Transform(toolContent) : toolContent;
  }

  private getCapabilityMergeStrategy(capability: ConfigCapability): MergeStrategy {
    if (capability instanceof McpCapability) {
      return capability.params.mergeStrategy ?? "user-prime";
    }
    return capability.getMergeStrategy();
  }
}
