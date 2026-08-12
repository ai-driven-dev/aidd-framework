import type { Manifest, PathOwner } from "../../../domain/models/manifest.js";
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
 * A path is retained when any owner survives the uninstall. Ownership is read from the
 * manifest's own path-to-owners view, so tool files, merge files and plugin-installed files
 * all count: skills reach a project through the plugin path, and an owners view that skips
 * plugins lets one owner delete a tree another owner still needs.
 */
export function computeRetainedPaths(
  manifest: Manifest,
  departing: readonly DepartingClaim[]
): RetainedPaths {
  const retained = new Map<string, ToolId[]>();
  for (const [path, owners] of manifest.getPathOwners()) {
    for (const owner of owners) {
      if (isDeparting(owner, departing)) continue;
      const survivors = retained.get(path);
      if (survivors === undefined) retained.set(path, [owner.toolId]);
      else if (!survivors.includes(owner.toolId)) survivors.push(owner.toolId);
    }
  }
  return retained;
}

function isDeparting(owner: PathOwner, departing: readonly DepartingClaim[]): boolean {
  return departing.some(
    (claim) =>
      claim.toolId === owner.toolId &&
      (claim.pluginName === null || claim.pluginName === owner.pluginName)
  );
}
