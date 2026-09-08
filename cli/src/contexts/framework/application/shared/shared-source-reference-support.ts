import { UnreadableUserSourceReferencesError } from "../../../../kernel/errors.js";
import { samePathSegment } from "../../../../kernel/paths.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { MarketplaceScope } from "../../../../kernel/scope.js";
import { FRAMEWORK_MARKETPLACE_NAME } from "../../../distribution/domain/marketplace.js";
import type { UserSourceReferences } from "../../domain/ports/user-source-references.js";

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
 * Whether uninstalling `ref` here would take away a plugin another project on this
 * machine still needs — the guard `clean` and `plugin remove` both apply before
 * driving a host's own CLI to uninstall a ref, never after.
 *
 * True exactly when all four hold: `sharedSourceHostName` is defined (this run
 * resolved the shared source's own hostName for this tool at all); `ref` actually
 * came from that source (`ref.endsWith(`@${sharedSourceHostName}`)`, never the
 * project's own local alias, which a host never learns); this host enables a plugin
 * for the whole machine rather than this project alone
 * (`enablementIsMachineGlobal` — codex, copilot); and at least one other project
 * still references the shared source. Any one of the four failing means uninstalling
 * `ref` here cannot break another project, so it proceeds as it always did.
 */
export function refAnotherProjectStillNeeds(input: {
  ref: string;
  sharedSourceHostName: string | undefined;
  enablementIsMachineGlobal: boolean;
  otherProjects: readonly string[];
}): boolean {
  const { ref, sharedSourceHostName, enablementIsMachineGlobal, otherProjects } = input;
  if (sharedSourceHostName === undefined) return false;
  if (!ref.endsWith(`@${sharedSourceHostName}`)) return false;
  if (!enablementIsMachineGlobal) return false;
  return otherProjects.length > 0;
}

/**
 * The message both `clean` and `plugin remove` warn with instead of ever uninstalling
 * `ref`, once `refAnotherProjectStillNeeds` says it is guarded — the two callers
 * differ only in how they resolve `binary`, `ref` and `otherProjects` (see each
 * caller's own `describeGuardedPluginRef`), never in the sentence itself. Names every
 * project in `otherProjects`, singular/plural correct, and points at the one command
 * that does remove the shared source for the machine.
 */
export function describeGuardedPluginRefMessage(input: {
  binary: string;
  ref: string;
  otherProjects: readonly string[];
}): string {
  const { binary, ref, otherProjects } = input;
  const plural = otherProjects.length === 1 ? "project" : "projects";
  const verb = otherProjects.length === 1 ? "references" : "reference";
  return (
    `${binary}: '${ref}' left enabled — ${binary} enables a plugin machine-wide, and ` +
    `${otherProjects.length} other ${plural} still ${verb} the shared source: ` +
    `${otherProjects.join(", ")}. \`aidd clean --scope user\` is what removes it for the machine.`
  );
}

/**
 * Every project this file still names as referencing the shared source, minus
 * `ownRoot` — the one denominator `clean`'s guard, its survival warning, its
 * dry-run preview, and `plugin remove`'s own guard all read, so a project that
 * never had a claim of its own to drop (or already dropped it) still reads the
 * same "other projects" fact a project that just dropped one does. `ownRoot`
 * must already be resolved (`resolveProjectRootForReferences`) — this does not
 * resolve it itself, since a caller occasionally already has it in hand from an
 * earlier step in the same run.
 */
export async function otherProjectsReferencing(
  userSourceReferences: UserSourceReferences,
  ownRoot: string
): Promise<readonly string[]> {
  return (await userSourceReferences.listAllReferencingProjects()).filter(
    (root) => !samePathSegment(root, ownRoot)
  );
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
