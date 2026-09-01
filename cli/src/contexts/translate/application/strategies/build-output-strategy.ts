import type { BuildPluginResult } from "../../domain/build-target.js";

/**
 * Source marketplace catalog entry from the framework's .claude-plugin/marketplace.json.
 * Shared by orchestrator and marketplace strategy.
 */
export interface SourcePluginEntry {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly [key: string]: unknown;
}

/**
 * Parsed source marketplace catalog from the framework root.
 */
export interface SourceMarketplace {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly owner: unknown;
  readonly plugins: readonly SourcePluginEntry[];
  readonly [key: string]: unknown;
}

/**
 * Port-style interface for the output layout strategy used by FrameworkBuildUseCase.
 *
 * Mode A (marketplace) and Mode B flat each implement this. The orchestrator calls
 * these methods in order for every plugin; the strategy owns all path computation
 * and file I/O for its layout.
 */
export interface BuildOutputStrategy {
  /**
   * Called once before iterating plugins. Mode A wipes and recreates outDir.
   * Flat mode validates outDir exists and is a directory.
   */
  preBuild(outDir: string, sourceDir: string): Promise<void>;

  /**
   * Write a synthesized or pass-through plugin manifest. Returns files written (0 or 1).
   */
  writePluginManifest(pluginName: string, pluginSrc: string, outDir: string): Promise<number>;

  /**
   * Write all agent files for a plugin. Returns files written.
   */
  writeAgents(pluginName: string, pluginSrc: string, outDir: string): Promise<number>;

  /**
   * Write all skill files for a plugin. Returns files written.
   */
  writeSkills(pluginName: string, pluginSrc: string, outDir: string): Promise<number>;

  /**
   * Write hooks artifacts for a plugin. Returns files written.
   */
  writeHooks(pluginName: string, pluginSrc: string, outDir: string): Promise<number>;

  /**
   * Write MCP artifacts for a plugin. Returns files written.
   */
  writeMcp(pluginName: string, pluginSrc: string, outDir: string): Promise<number>;

  /**
   * Called once after all plugins are built. Returns extra files written (e.g.
   * marketplace.json = 1 for Mode A; 0 for flat mode).
   */
  postBuild(
    sourceMarketplace: SourceMarketplace,
    builtPlugins: readonly BuildPluginResult[],
    outDir: string
  ): Promise<number>;
}
