import { UnreadableUserSourceReferencesError } from "../../../../kernel/errors.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { MarketplaceScope } from "../../../../kernel/scope.js";
import { FRAMEWORK_MARKETPLACE_NAME } from "../../../distribution/domain/marketplace.js";

/** Whether a registration is the one shared, machine-scope source every project's own
 * `references.json` claim tracks — the reserved name at scope `"user"`, checked
 * identically by `setup`, `sync` and `clean` before any of them reads or writes that
 * claim (`architecture.md`). A single predicate rather than three inline checks: a
 * fourth site drifting onto a different spelling is exactly how `setup` used to skip
 * it entirely. */
export function frameworkSourceIsShared(name: string, scope: MarketplaceScope): boolean {
  return name === FRAMEWORK_MARKETPLACE_NAME && scope === "user";
}

/**
 * Resolves `projectRoot` through every symlink, the same real location `clean` insists
 * on before it ever deletes a user-scope file — a reference recorded under a syntactic
 * path a symlink later moved would never match the path a later `clean` resolves for the
 * very same project. Falls back to the path as given only when it has stopped existing
 * (`ENOENT`): `clean` still needs to drop its own reference to a project whose directory
 * was removed after the fact.
 */
export async function resolveProjectRootForReferences(
  fs: FileReader,
  projectRoot: string
): Promise<string> {
  try {
    return await fs.realpath(projectRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return projectRoot;
    throw error;
  }
}

/**
 * Runs `action`, treating a `references.json` this CLI cannot make sense of — corrupted
 * JSON, or a shape `UserSourceReferencesAdapter` refuses to trust — exactly like an
 * absent one: the file is a help, not an authority, so a reader or writer of it must
 * never block the command it does not gate. `setup`, `sync` and `clean` all reach the
 * port through this, never a bare call, so a fourth caller cannot reintroduce the same
 * failure by forgetting to catch it. The error already names the file and the remedy;
 * `logger.warn` prints exactly that, and `fallback` is what the caller would have used
 * had the port never been wired in at all. Anything other than
 * `UnreadableUserSourceReferencesError` is a bug, not a corrupted file, and propagates.
 */
export async function toleratingUnreadableSourceReferences<T>(
  logger: Logger,
  fallback: T,
  action: () => Promise<T>
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (!(error instanceof UnreadableUserSourceReferencesError)) throw error;
    logger.warn(error.message);
    return fallback;
  }
}
