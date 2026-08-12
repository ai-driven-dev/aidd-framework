import { join } from "node:path";
import { McpCapability } from "../../../domain/capabilities/mcp-capability.js";
import type { PluginsCapability } from "../../../domain/capabilities/plugins-capability.js";
import { McpSectionUndeclaredError } from "../../../domain/errors.js";
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
import type { PluginTranslator } from "./translator/plugin-translator.js";

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

/**
 * The JSON key a flat tool keeps plugin-contributed MCP servers under, or null when the
 * tool does not merge them at all. Read from the tool rather than assumed: opencode uses
 * `mcp` in opencode.json, gemini `mcpServers` in .gemini/settings.json, and running one
 * tool's unmerge against the other's file would leave a junk section behind.
 *
 * Throws rather than falling back when a tool qualifies but declares no section: a silent
 * default here is a wrong write to a user-owned file.
 */
export function flatMcpSectionKey(caps: Record<string, unknown>, toolId: string): string | null {
  if (!("mcp" in caps)) return null;
  const mcp = caps.mcp;
  if (!(mcp instanceof McpCapability)) return null;
  if (mcp.params.mergeStrategy !== "framework-prime") return null;
  const plugins = caps.plugins as PluginsCapability;
  if (plugins.mode !== "flat") return null;
  const key = mcp.params.entrySection;
  if (key === undefined) throw new McpSectionUndeclaredError(toolId);
  return key;
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

/** Deletes exactly the paths a plugin's own manifest entry lists, joined to its base dir.
 * Never enumerates the directory or deletes by pattern — only manifest-tracked keys. */
export async function deleteOldFiles(
  files: ReadonlyMap<string, string>,
  baseDir: string,
  fs: FileWriter
): Promise<void> {
  for (const relativePath of files.keys()) {
    await fs.deleteFile(join(baseDir, relativePath));
  }
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
 * Re-registers a marketplace-sourced plugin through its resolved translator: drops the
 * existing manifest entry and lets the translator re-add it, so update and restore both
 * end up with the same single entry an install would have produced. Works for either
 * translation strategy — materializing tools (cursor/opencode) re-copy the BUILT tree;
 * Mode A marketplace tools (claude/codex/copilot) register the plugin reference without
 * writing any files, matching what install does for them.
 *
 * Returns how many files the translator actually (re)wrote — not the plugin's total
 * file count — so a no-op restore reports zero instead of claiming everything changed.
 * `written` is undefined for translators that don't track counts (Mode A never writes
 * files; the rare built-tree fallback where the marketplace can't be resolved); that
 * is reported as 0 rather than guessed.
 */
export async function materializeViaTranslator(
  translator: PluginTranslator,
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
