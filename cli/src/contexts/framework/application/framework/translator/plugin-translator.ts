import type { PluginSource } from "../../../../../kernel/source.js";
import type { AiToolId } from "../../../../../kernel/tool.js";
import type { PluginTranslationMode } from "../../../../tools/domain/plugin-translation-mode.js";
import type { PluginDistribution } from "../../../../translate/domain/plugin-distribution.js";
import type { ReadonlySkipList } from "../../../../translate/domain/plugin-translation-skip.js";
import type { Manifest } from "../../../domain/manifest.js";

/**
 * Contract implemented by both translation strategy adapters.
 *
 * This interface is a translator strategy contract (not a hexagonal port adapter).
 * It lives in `application/use-cases/framework/translator/` following the capability
 * sub-use-case subdir pattern (see `.claude/skills/use-case/references/capability-sub-use-cases.md`).
 */
export interface PluginTranslator {
  /** Discriminant identifying which translation strategy this adapter implements. */
  readonly mode: PluginTranslationMode;

  /**
   * Add a plugin for a specific tool, writing files and/or registering the plugin reference
   * in the manifest according to this adapter's strategy.
   *
   * Returns a skip list — non-empty when the plugin contains components the tool cannot consume —
   * and, for strategies that track it, how many files were actually (re)written to disk.
   *
   * `previousMcpEntries` — pass the plugin's previous mcpEntries when replacing an existing
   * plugin install (--replace path). Used for idempotent re-merge of OpenCode MCP servers.
   */
  addPlugin(
    dist: PluginDistribution,
    toolId: AiToolId,
    source: PluginSource,
    projectRoot: string,
    manifest: Manifest,
    marketplace: string | undefined,
    previousMcpEntries?: ReadonlyMap<string, string>
  ): Promise<{ skipped: ReadonlySkipList; written?: number }>;
}
