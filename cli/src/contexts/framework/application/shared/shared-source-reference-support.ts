import { UnreadableUserSourceReferencesError } from "../../../../kernel/errors.js";
import { samePathSegment } from "../../../../kernel/paths.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { MarketplaceScope } from "../../../../kernel/scope.js";
import { FRAMEWORK_MARKETPLACE_NAME } from "../../../distribution/domain/marketplace.js";
import type { UserSourceReferences } from "../../domain/ports/user-source-references.js";

/** The reserved name at scope `"user"`: the one shared, machine-scope source every project's own
 * `references.json` claim tracks. A single predicate rather than an inline check per caller, so a
 * fourth site cannot drift onto a different spelling and skip the check. */
export function frameworkSourceIsShared(name: string, scope: MarketplaceScope): boolean {
  return name === FRAMEWORK_MARKETPLACE_NAME && scope === "user";
}

/**
 * Whether uninstalling `ref` here would take away a plugin another project on this machine still
 * needs — applied before driving a host's own CLI to uninstall, never after.
 *
 * `ref` is matched against `sharedSourceHostName`, never the project's own local alias, which a
 * host never learns. Any one condition failing means uninstalling `ref` here cannot break another
 * project, so it proceeds.
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
 * The instruction for fully removing the shared source, once a message has already named which
 * other projects still need it. Each command name stays whole inside this one string literal:
 * `errors-that-instruct.arch.test.ts` reads every string and template literal under `application/`
 * and checks each command it names against the ones the CLI declares.
 */
export function describeFullRemovalInstruction(): string {
  return "full removal is `aidd clean` in each of them, then `aidd clean --scope user`.";
}

/**
 * The message both `clean` and `plugin remove` warn with instead of ever uninstalling `ref`, once
 * `refAnotherProjectStillNeeds` says it is guarded — the two callers differ only in how they
 * resolve the inputs, never in the sentence itself.
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
    `${otherProjects.join(", ")} — which is why it stays; ${describeFullRemovalInstruction()}`
  );
}

/**
 * Every project this file still names as referencing the shared source, minus `ownRoot` — the one
 * denominator every caller reads, so a project that never had a claim of its own to drop reads the
 * same "other projects" fact as one that just dropped one. `ownRoot` must already be resolved
 * through `resolveProjectRootForReferences`; this does not resolve it itself.
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
 * Resolves `projectRoot` through every symlink, the same real location `clean` insists on before
 * deleting a user-scope file — a reference recorded under a syntactic path a symlink later moved
 * would never match what a later `clean` resolves for the same project. Falls back to the path as
 * given only on `ENOENT`, so `clean` can still drop a reference to a project since removed.
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
 * Runs `action`, treating a `references.json` this CLI cannot make sense of exactly like an absent
 * one: the file is a help, not an authority, so reading or writing it must never block the command
 * it does not gate. Every caller reaches the port through this, so none can reintroduce that
 * failure by forgetting to catch it. Anything other than `UnreadableUserSourceReferencesError` is
 * a bug, not a corrupted file, and propagates.
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
