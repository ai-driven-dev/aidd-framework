import type { ManifestRepository } from "../../contexts/framework/domain/ports/manifest-repository.js";
import type {
  InstalledPluginRef,
  InstalledPluginsReader,
} from "../../contexts/telemetry/domain/ports/installed-plugins-reader.js";
import { AI_TOOL_IDS, type AiToolId } from "../../kernel/tool.js";

/**
 * Answers telemetry's `InstalledPluginsReader` from the installation manifest.
 *
 * It lives here, in the composition root, because it belongs to neither side: telemetry
 * states what it needs to know, framework keeps the record, and something has to translate
 * one into the other. Putting it in either context would be that context reaching into the
 * other's vocabulary, which is the thing the two ports exist to stop.
 */
export function installedPluginsFromManifest(repo: ManifestRepository): InstalledPluginsReader {
  return {
    path: repo.path,
    read: async () => {
      const manifest = await repo.load();
      if (manifest === null) return null;
      const byTool = new Map<AiToolId, readonly InstalledPluginRef[]>();
      for (const tool of AI_TOOL_IDS) {
        const plugins = manifest.getPlugins(tool);
        if (plugins.length === 0) continue;
        byTool.set(
          tool,
          plugins.map((plugin) => ({ name: plugin.name, marketplace: plugin.marketplace }))
        );
      }
      return byTool;
    },
  };
}
