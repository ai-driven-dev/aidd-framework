import { join } from "node:path";
import { extractMergeEntries, type MergeFileEntry } from "../../../../kernel/merge.js";
import type { AssetProvider } from "../../../../kernel/ports/asset-provider.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Hasher } from "../../../../kernel/ports/hasher.js";
import type { AiToolId, IdeToolId } from "../../../../kernel/tool.js";
import { AI_TOOL_IDS } from "../../../../kernel/tool.js";
import { SettingsCapability } from "../../../tools/domain/capabilities/settings-capability.js";
import type { FileMerger } from "../../../tools/domain/ports/file-merger.js";
import { getToolConfig, isAiTool } from "../../../tools/domain/registry.js";
import type { Manifest } from "../../domain/manifest.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type {
  InstallIdeConfigResult,
  InstallIdeConfigUseCase,
} from "./install-ide-config-use-case.js";
import type { PostInstallPipelineUseCase } from "./post-install-pipeline-use-case.js";

export interface InstallIdeToolOptions {
  toolId: IdeToolId;
  projectRoot: string;
  manifest: Manifest;
  force: boolean;
  version: string;
}

export class InstallIdeToolUseCase {
  constructor(
    private readonly installIdeConfigUseCase: InstallIdeConfigUseCase,
    private readonly manifestRepo: ManifestRepository,
    private readonly fs: FileReader & FileWriter & FileMerger,
    private readonly hasher: Hasher,
    private readonly postInstallPipelineUseCase: PostInstallPipelineUseCase,
    private readonly assetProvider?: AssetProvider
  ) {}

  async execute(options: InstallIdeToolOptions): Promise<InstallIdeConfigResult> {
    const result = await this.installIdeConfigUseCase.execute(options);
    if (result.skipped) return result;
    await this.propagateAiStaticSettings(options.toolId, options.projectRoot);
    return result;
  }

  private async propagateAiStaticSettings(ideId: IdeToolId, projectRoot: string): Promise<void> {
    const manifest = await this.manifestRepo.load();
    if (manifest === null) return;
    for (const aiId of AI_TOOL_IDS) {
      if (!manifest.hasTool(aiId)) continue;
      await this.mergeAiToolSettings(aiId, ideId, projectRoot, manifest);
    }
  }

  private async mergeAiToolSettings(
    aiId: AiToolId,
    ideId: IdeToolId,
    projectRoot: string,
    manifest: Manifest
  ): Promise<void> {
    const toolConfig = getToolConfig(aiId);
    if (!isAiTool(toolConfig)) return;
    const caps = toolConfig.capabilities as Record<string, unknown>;
    const raw = caps.settings;
    const capabilities = Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [];
    const toMerge = capabilities.filter(
      (c): c is SettingsCapability =>
        c instanceof SettingsCapability &&
        (c.staticContent !== undefined || c.staticContentAssetFile !== undefined) &&
        c.requiresTool === ideId
    );
    if (toMerge.length === 0) return;
    const existingEntries = [...manifest.getMergeFiles(aiId)];
    for (const cap of toMerge) {
      await this.mergeAndTrack(cap, projectRoot, aiId, existingEntries, manifest);
    }
  }

  private async mergeAndTrack(
    cap: SettingsCapability,
    projectRoot: string,
    aiId: AiToolId,
    existingEntries: MergeFileEntry[],
    manifest: Manifest
  ): Promise<void> {
    const fullPath = join(projectRoot, cap.buildOutputPath());
    const content = this.resolveCapabilityContent(cap, aiId);
    await this.fs.mergeJsonFile(fullPath, content, cap.getMergeStrategy());
    const diskContent = await this.fs.readFile(fullPath);
    const hashes = extractMergeEntries(diskContent, null, this.hasher);
    const newEntry: MergeFileEntry = {
      relativePath: cap.buildOutputPath(),
      sectionKey: null,
      entries: hashes,
    };
    const updated = [
      ...existingEntries.filter((e) => e.relativePath !== cap.buildOutputPath()),
      newEntry,
    ];
    manifest.updateToolMergeFiles(aiId, updated);
    await this.postInstallPipelineUseCase.execute({
      projectRoot,
      manifest,
    });
  }

  private resolveCapabilityContent(cap: SettingsCapability, aiId: AiToolId): string {
    if (cap.staticContent !== undefined) return cap.staticContent;
    if (cap.staticContentAssetFile !== undefined && this.assetProvider !== undefined) {
      const asset = this.assetProvider.loadConfigAsset(aiId, cap.staticContentAssetFile);
      return typeof asset === "string" ? asset : JSON.stringify(asset, null, 2);
    }
    return "{}";
  }
}
