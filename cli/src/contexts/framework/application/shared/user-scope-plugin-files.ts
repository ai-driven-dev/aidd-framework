import { join } from "node:path";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { AiToolId } from "../../../../kernel/tool.js";
import { resolvePluginsCapability } from "../../../tools/domain/registry.js";
import type { InstalledPlugin } from "../../domain/plugins/installed-plugin.js";
import { isStrictlyWithinUserScope } from "../../domain/plugins/user-scope-containment.js";

/**
 * The files of a user-scope plugin (Cursor's `~/.cursor/plugins/local/<plugin>`) that
 * are actually safe to delete — a file is safe only once its real, `realpath`-resolved
 * location, after every symlink and `..` segment is followed, still sits strictly
 * inside the tool's own declared user-scope directory. A `..` segment a corrupted
 * manifest entry carries, or a plugin directory that became a symlink after install,
 * both fail this and are left in place, named, rather than silently deleted or
 * silently kept.
 *
 * Shared by `CleanUseCase` (project scope, `plugin.scope === "user"` is the one case it
 * ever calls this for) and `CleanUserScopeUseCase` (machine scope, every plugin its own
 * manifest entry ever carries is already user-scope by construction) — the same
 * containment check either way, so a symlink escape is caught once, not twice with one
 * copy quietly drifting from the other.
 */
export async function userScopeFilesSafeToDelete(
  fs: FileReader,
  logger: Logger,
  plugin: InstalledPlugin,
  toolId: AiToolId,
  homedir: string
): Promise<ReadonlyMap<string, string>> {
  const boundary = resolvePluginsCapability(toolId)?.userPluginsBaseDir(homedir);
  if (boundary === null || boundary === undefined) return new Map();
  const resolvedBoundary = await tryRealpath(fs, boundary);
  if (resolvedBoundary === null) return new Map();
  const allowed = new Map<string, string>();
  for (const [relativePath, hash] of plugin.files) {
    const resolvedCandidate = await tryRealpath(fs, join(boundary, relativePath));
    if (
      resolvedCandidate !== null &&
      isStrictlyWithinUserScope(resolvedCandidate, resolvedBoundary)
    ) {
      allowed.set(relativePath, hash);
      continue;
    }
    logger.warn(
      `${toolId}: '${plugin.name}' file '${relativePath}' does not resolve inside ${boundary}; left in place.`
    );
  }
  return allowed;
}

async function tryRealpath(fs: FileReader, path: string): Promise<string | null> {
  try {
    return await fs.realpath(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
