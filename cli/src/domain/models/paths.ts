import { join } from "node:path";

export const AIDD_DIR = ".aidd";
export const DOCS_DIR = "aidd_docs" as const;
export const PLUGIN_CACHE_SUBDIR = join(AIDD_DIR, "plugin-cache");
export const MARKETPLACE_CACHE_SUBDIR = join(AIDD_DIR, "cache", "marketplaces");
export const BUILT_CACHE_SUBDIR = join(AIDD_DIR, "cache", "built");

export function marketplaceCacheDir(projectRoot: string, marketplaceName: string): string {
  return join(projectRoot, MARKETPLACE_CACHE_SUBDIR, marketplaceName);
}

export function builtMarketplaceDir(
  projectRoot: string,
  marketplaceName: string,
  target: string
): string {
  return join(projectRoot, BUILT_CACHE_SUBDIR, marketplaceName, target);
}

/**
 * Where a user-scope marketplace's built tree lives: under the CLI's own user
 * directory, which is already the `.aidd` of the user, so the layout below it repeats
 * the project one without repeating the `.aidd` segment.
 */
export function userBuiltMarketplaceDir(
  userConfigDir: string,
  marketplaceName: string,
  target: string
): string {
  return join(userConfigDir, "cache", "built", marketplaceName, target);
}
