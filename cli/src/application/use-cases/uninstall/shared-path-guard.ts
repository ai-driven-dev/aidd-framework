import type { Manifest } from "../../../domain/models/manifest.js";
import type { ToolId } from "../../../domain/tools/registry.js";

/**
 * One claim being released by an uninstall. A `null` plugin name means the whole tool
 * leaves, plugins included.
 */
export interface DepartingClaim {
  readonly toolId: ToolId;
  readonly pluginName: string | null;
}

/** Relative path to the tools that still claim it once the departing claims are released. */
export type RetainedPaths = ReadonlyMap<string, readonly ToolId[]>;

/**
 * The single answer to "may this uninstall delete that file?".
 *
 * A path is retained when any surviving owner still claims it. An owner claims a path
 * through its own files, its merge files, or any file one of its plugins installed —
 * skills reach a project through the plugin path, so an owners view that skips plugins
 * lets one owner delete a tree another owner still needs.
 */
export function computeRetainedPaths(
  manifest: Manifest,
  departing: readonly DepartingClaim[]
): RetainedPaths {
  const retained = new Map<string, ToolId[]>();
  for (const toolId of manifest.getInstalledToolIds()) {
    if (departing.some((claim) => claim.toolId === toolId && claim.pluginName === null)) continue;
    for (const path of ownedPaths(manifest, toolId, departingPluginsOf(departing, toolId))) {
      const owners = retained.get(path);
      if (owners === undefined) retained.set(path, [toolId]);
      else if (!owners.includes(toolId)) owners.push(toolId);
    }
  }
  return retained;
}

function departingPluginsOf(
  departing: readonly DepartingClaim[],
  toolId: ToolId
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const claim of departing) {
    if (claim.toolId === toolId && claim.pluginName !== null) names.add(claim.pluginName);
  }
  return names;
}

function ownedPaths(
  manifest: Manifest,
  toolId: ToolId,
  departingPlugins: ReadonlySet<string>
): string[] {
  const paths = manifest.getToolFiles(toolId).map((file) => file.relativePath);
  paths.push(...manifest.getMergeFiles(toolId).map((merge) => merge.relativePath));
  for (const plugin of manifest.getPlugins(toolId)) {
    if (departingPlugins.has(plugin.name)) continue;
    paths.push(...plugin.files.keys());
  }
  return paths;
}
