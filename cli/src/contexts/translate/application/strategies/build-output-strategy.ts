import type {
  SourceMarketplaceRef,
  SourcePluginEntryRef,
} from "../../../tools/domain/build-contract.js";
import type { BuildPluginResult } from "../../domain/build-target.js";

/** Source marketplace catalog entry from the framework's `.claude-plugin/marketplace.json`.
 * The build contract already describes this shape for tool authors, so the orchestrator speaks
 * the same type rather than a near-identical twin only a cast could bridge. */
export type SourcePluginEntry = SourcePluginEntryRef;

export type SourceMarketplace = SourceMarketplaceRef;

/** The output layout strategy the framework build calls: a marketplace layout and a flat one
 * each implement it, and the strategy owns all path computation and file I/O for its own
 * layout. */
export interface BuildOutputStrategy {
  /** Called once before iterating plugins: the marketplace layout wipes and recreates outDir,
   * flat mode only validates that it exists. */
  preBuild(outDir: string, sourceDir: string): Promise<void>;

  /** Returns the number of files written, 0 or 1. */
  writePluginManifest(pluginName: string, pluginSrc: string, outDir: string): Promise<number>;

  writeAgents(pluginName: string, pluginSrc: string, outDir: string): Promise<number>;

  writeSkills(pluginName: string, pluginSrc: string, outDir: string): Promise<number>;

  writeHooks(pluginName: string, pluginSrc: string, outDir: string): Promise<number>;

  writeMcp(pluginName: string, pluginSrc: string, outDir: string): Promise<number>;

  /** Called once after every plugin is built. Returns extra files written — a marketplace
   * catalog counts 1, flat mode 0. */
  postBuild(
    sourceMarketplace: SourceMarketplace,
    builtPlugins: readonly BuildPluginResult[],
    outDir: string
  ): Promise<number>;
}
