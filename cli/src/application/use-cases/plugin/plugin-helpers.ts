import { join } from "node:path";
import { McpCapability } from "../../../domain/capabilities/mcp-capability.js";
import type { PluginsCapability } from "../../../domain/capabilities/plugins-capability.js";
import type { InstallationFile } from "../../../domain/models/file.js";
import type { Manifest } from "../../../domain/models/manifest.js";
import type { Plugin } from "../../../domain/models/plugin.js";
import type { PluginDistribution } from "../../../domain/models/plugin-distribution.js";
import type { AiToolId } from "../../../domain/models/tool-ids.js";
import { AI_TOOL_IDS } from "../../../domain/models/tool-ids.js";
import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { FileWriter } from "../../../domain/ports/file-writer.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import { getToolConfig, isAiTool } from "../../../domain/tools/registry.js";
import { NoManifestError } from "../../errors.js";
import type { BuiltTreeMaterializationTranslator } from "./translator/built-tree-materialization-translator.js";

export function resolvePluginToolIds(toolIds: AiToolId[] | "all", manifest: Manifest): AiToolId[] {
  if (toolIds !== "all") return toolIds;
  return AI_TOOL_IDS.filter((id) => manifest.hasTool(id)) as AiToolId[];
}

/** The base directory a plugin's files live under: `projectRoot` for project-scope
 * plugins, the home-relative dir `PluginsCapability` resolves for user-scope ones. */
export function resolvePluginBaseDirForCapability(
  plugins: PluginsCapability,
  projectRoot: string,
  homedir: () => string
): string {
  return plugins.resolvePluginsBaseDir(projectRoot, homedir());
}

export function resolvePluginBaseDir(
  toolId: AiToolId,
  projectRoot: string,
  homedir: () => string
): string {
  const toolConfig = getToolConfig(toolId);
  if (!isAiTool(toolConfig)) return projectRoot;
  const caps = toolConfig.capabilities as Record<string, unknown>;
  if (!("plugins" in caps)) return projectRoot;
  return resolvePluginBaseDirForCapability(caps.plugins as PluginsCapability, projectRoot, homedir);
}

export function qualifiesForOpencodeMcpMerge(caps: Record<string, unknown>): boolean {
  if (!("mcp" in caps)) return false;
  const mcp = caps.mcp;
  if (!(mcp instanceof McpCapability)) return false;
  if (mcp.params.mergeStrategy !== "framework-prime") return false;
  const plugins = caps.plugins as PluginsCapability;
  return plugins.mode === "flat";
}

export async function loadPluginManifest(manifestRepo: ManifestRepository): Promise<Manifest> {
  const manifest = await manifestRepo.load();
  if (manifest === null) throw new NoManifestError();
  return manifest;
}

export async function writePluginFiles(
  files: InstallationFile[],
  baseDir: string,
  fs: FileWriter
): Promise<void> {
  await Promise.all(files.map((f) => fs.writeFile(join(baseDir, f.relativePath), f.content)));
}

/** Whether the file already on disk matches the content we would write, so a
 * caller can skip the write and, more importantly, not count it as restored. */
export async function isPluginFileAtDesiredState(
  fs: FileReader,
  hasher: Hasher,
  outputPath: string,
  expectedHashValue: string
): Promise<boolean> {
  if (!(await fs.fileExists(outputPath))) return false;
  const content = await fs.readFile(outputPath);
  return hasher.hash(content).value === expectedHashValue;
}

/**
 * Re-registers a plugin backed by the BUILT tree: drops the existing manifest entry
 * and lets the translator re-materialize + re-register it, so update and restore both
 * end up with the same single entry an install would have produced.
 *
 * Returns how many files the translator actually (re)wrote — not the plugin's total
 * file count — so a no-op restore reports zero instead of claiming everything changed.
 * `written` is undefined only on the rare fallback path where the translator can't
 * resolve the marketplace and delegates to a strategy that doesn't track counts; that
 * is reported as 0 rather than guessed.
 */
export async function materializeViaBuiltTree(
  translator: BuiltTreeMaterializationTranslator,
  dist: PluginDistribution,
  toolId: AiToolId,
  plugin: Plugin,
  projectRoot: string,
  manifest: Manifest,
  docsDir: string
): Promise<number> {
  manifest.removePlugin(toolId, plugin.name);
  const { written } = await translator.addPlugin(
    dist,
    toolId,
    plugin.source,
    projectRoot,
    manifest,
    plugin.marketplace,
    docsDir
  );
  return written ?? 0;
}
