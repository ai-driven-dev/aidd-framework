import { extractConfigCapabilities } from "../../../domain/models/config-capability.js";
import { InstallationFile, removeRedundantGitkeeps } from "../../../domain/models/file.js";
import type { ContentSection, FrameworkDescriptor } from "../../../domain/models/framework.js";
import type { AiToolId } from "../../../domain/models/tool-ids.js";
import type { AssetProvider } from "../../../domain/ports/asset-provider.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { Platform } from "../../../domain/ports/platform.js";
import type {
  AiTool,
  HasAgents,
  HasCommands,
  HasRules,
  HasSkills,
} from "../../../domain/tools/contracts.js";
import { isAiTool, type ToolConfig } from "../../../domain/tools/registry.js";
import { InstallAgentsUseCase } from "../install/install-agents-use-case.js";
import { InstallCommandsUseCase } from "../install/install-commands-use-case.js";
import { InstallConfigUseCase } from "../install/install-config-use-case.js";
import { InstallRulesUseCase } from "../install/install-rules-use-case.js";
import { InstallSkillsUseCase } from "../install/install-skills-use-case.js";

interface GenerateToolDistributionOptions {
  config: ToolConfig;
  descriptor: FrameworkDescriptor;
  contentFiles: Map<string, string>;
  docsDir: string;
  projectRoot: string;
}

export class GenerateToolDistributionUseCase {
  constructor(
    private readonly fs: FileReader,
    private readonly hasher: Hasher,
    private readonly platform: Platform,
    private readonly assetProvider?: AssetProvider
  ) {}

  async execute(options: GenerateToolDistributionOptions): Promise<InstallationFile[]> {
    const { config, descriptor, contentFiles, docsDir, projectRoot } = options;
    if (!isAiTool(config)) {
      return this.generateIdeToolFiles(config, descriptor, contentFiles, projectRoot);
    }
    return this.generateAiToolFiles(config, descriptor, contentFiles, docsDir, projectRoot);
  }

  private async generateIdeToolFiles(
    config: ToolConfig,
    descriptor: FrameworkDescriptor,
    contentFiles: Map<string, string>,
    projectRoot: string
  ): Promise<InstallationFile[]> {
    const configFiles = await new InstallConfigUseCase(this.fs, this.hasher).execute({
      capabilities: extractConfigCapabilities(config),
      configRefs: descriptor.configRefs,
      contentFiles,
      projectRoot,
      platform: this.platform,
    });
    return removeRedundantGitkeeps(configFiles);
  }

  private async generateAiToolFiles(
    config: AiTool<unknown>,
    descriptor: FrameworkDescriptor,
    contentFiles: Map<string, string>,
    docsDir: string,
    projectRoot: string
  ): Promise<InstallationFile[]> {
    const caps = config.capabilities as Record<string, unknown>;
    const sectionFiles = this.generateCapabilitySectionFiles(
      caps,
      config,
      descriptor,
      contentFiles,
      docsDir
    );
    const configFiles = await new InstallConfigUseCase(this.fs, this.hasher).execute({
      capabilities: extractConfigCapabilities(config),
      configRefs: descriptor.configRefs,
      contentFiles,
      projectRoot,
      platform: this.platform,
      assetProvider: this.assetProvider,
      toolId: config.toolId as AiToolId,
    });
    const outputPathFiles = this.buildConfigOutputPathFiles(config);
    return removeRedundantGitkeeps([...sectionFiles, ...configFiles, ...outputPathFiles]);
  }

  private buildConfigOutputPathFiles(config: AiTool<unknown>): InstallationFile[] {
    if (this.assetProvider === undefined) return [];
    const outputPaths = config.configOutputPaths;
    if (outputPaths === undefined) return [];
    const files: InstallationFile[] = [];
    for (const [fileName, outputPath] of Object.entries(outputPaths)) {
      const asset = this.assetProvider.loadConfigAsset(config.toolId as AiToolId, fileName);
      const content = typeof asset === "string" ? asset : JSON.stringify(asset, null, 2);
      files.push(
        new InstallationFile({
          relativePath: outputPath,
          content,
          hash: this.hasher.hash(content),
        })
      );
    }
    return files;
  }

  private generateCapabilitySectionFiles(
    caps: Record<string, unknown>,
    config: AiTool<unknown>,
    descriptor: FrameworkDescriptor,
    contentFiles: Map<string, string>,
    docsDir: string
  ): InstallationFile[] {
    const results: InstallationFile[] = [];
    for (const section of descriptor.contentSections) {
      if (!(section.name in caps)) continue;
      results.push(...this.generateSectionFiles(config, section, contentFiles, docsDir));
    }
    return results;
  }

  private generateSectionFiles(
    config: AiTool<unknown>,
    section: ContentSection,
    contentFiles: Map<string, string>,
    docsDir: string
  ): InstallationFile[] {
    const base = { section, contentFiles, docsDir };
    switch (section.name) {
      case "agents":
        return new InstallAgentsUseCase(this.hasher).execute({
          ...base,
          toolConfig: config as AiTool<HasAgents>,
        });
      case "commands":
        return new InstallCommandsUseCase(this.hasher).execute({
          ...base,
          toolConfig: config as AiTool<HasCommands>,
        });
      case "rules":
        return new InstallRulesUseCase(this.hasher).execute({
          ...base,
          toolConfig: config as AiTool<HasRules>,
        });
      case "skills":
        return new InstallSkillsUseCase(this.hasher).execute({
          ...base,
          toolConfig: config as AiTool<HasSkills>,
        });
      default:
        return [];
    }
  }
}
