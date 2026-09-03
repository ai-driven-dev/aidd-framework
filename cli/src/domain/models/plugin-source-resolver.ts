import { isAbsolute, relative } from "node:path";
import type { Marketplace } from "./marketplace.js";
import type { PluginSource, PluginSourceGitSubdir } from "./plugin-source.js";

export function resolvePluginSourceFromMarketplace(
  entrySource: PluginSource,
  marketplace: Marketplace,
  marketplaceLocalPath: string
): PluginSource {
  if (entrySource.kind !== "local") return entrySource;
  if (marketplace.source.kind !== "github") return entrySource;

  const normalizedPath = toRelativePath(entrySource.path, marketplaceLocalPath);
  if (normalizedPath === null) return entrySource;

  const resolved: PluginSourceGitSubdir = {
    kind: "git-subdir",
    url: `https://github.com/${marketplace.source.repo}.git`,
    path: normalizedPath,
    ref: marketplace.source.ref,
  };
  return resolved;
}

// isAbsolute(), never a leading "/": a Windows path is absolute and starts with its drive
// letter, so the "/" test read "D:\\gh-mkt\\sample-plugin" as already-relative and handed
// the whole absolute path back as the git subdir.
function toRelativePath(sourcePath: string, localBase: string): string | null {
  if (!isAbsolute(sourcePath)) {
    const stripped = sourcePath.startsWith("./") ? sourcePath.slice(2) : sourcePath;
    return stripped.length > 0 ? stripped : null;
  }
  const rel = relative(localBase, sourcePath);
  if (rel.startsWith("..") || rel === "") return null;
  return rel;
}
