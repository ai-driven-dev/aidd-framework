import { join } from "node:path";
import { NoManifestError } from "../../../../kernel/errors.js";
import type { InstallationFile } from "../../../../kernel/file.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../kernel/ports/file-writer.js";
import type { Hasher } from "../../../../kernel/ports/hasher.js";
import type { AiToolId } from "../../../../kernel/tool.js";
import { AI_TOOL_IDS } from "../../../../kernel/tool.js";
import { McpCapability } from "../../../tools/domain/capabilities/mcp-capability.js";
import type { PluginsCapability } from "../../../tools/domain/capabilities/plugins-capability.js";
import { getToolConfig, isAiTool } from "../../../tools/domain/registry.js";
import type { PluginDistribution } from "../../../translate/domain/plugin-distribution.js";
import type { Manifest } from "../../domain/manifest.js";
import type { InstalledPlugin } from "../../domain/plugins/installed-plugin.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type { PluginTranslator } from "../framework/translator/plugin-translator.js";

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
  plugin: InstalledPlugin,
  projectRoot: string,
  manifest: Manifest
): Promise<number> {
  manifest.removePlugin(toolId, plugin.name);
  const { written } = await translator.addPlugin(
    dist,
    toolId,
    plugin.source,
    projectRoot,
    manifest,
    plugin.marketplace
  );
  return written ?? 0;
}
