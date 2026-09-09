import {
  parseBuiltMarketplaceDir,
  parseBuiltMarketplaceDirAtAnyRoot,
  parseUserBuiltMarketplaceDir,
  samePathSegment,
} from "../../../kernel/paths.js";
import { compareSemver, isSemver } from "../../../kernel/semver.js";

/** Every path a caller hands `marketplaceSourceDrift` — `userCacheRoot`, `projectRoot` and the two
 * sources compared against them — is expected already `realpath`'d: this decides a migration story
 * about aidd's own version, not a filesystem question. */
export interface MarketplaceSourceDriftContext {
  readonly userCacheRoot: string;
  readonly projectRoot: string;
  readonly marketplaceName: string;
  readonly target: string;
}

export type MarketplaceSourceDrift =
  | {
      /** The host already follows a newer build of aidd's own shared source than
       * this run would request — refusing to overwrite it is the rollback refusal:
       * a lower version must never make the host follow it backward. */
      readonly kind: "version-behind";
      readonly registeredVersion: string;
      readonly requestedVersion: string;
    }
  | {
      /** The host still points at this project's own pre-migration, per-project
       * cache rather than the shared, machine-scope one `requestedSource` names. */
      readonly kind: "unmigrated-project-source";
    }
  | {
      /** The host still points at *another* project's own pre-migration cache, discovered from the
       * registered path's own segments alone. A caller that can write `references.json` uses
       * `projectRoot` to record that project's own claim on the shared source. */
      readonly kind: "unmigrated-foreign-project-source";
      readonly projectRoot: string;
    };

/**
 * Whether a host's registered source names a path this project recognises as its own — one CLI
 * version behind the shared source, or still the pre-migration per-project cache — decided purely
 * from each path's own segments, never from a catalog's declared name or plugin set. `undefined`
 * when the registered path is neither shape: `marketplaceSourceConflict` decides that case by
 * reading each side's own `marketplace.json`.
 *
 * A version segment that is not valid semver is never compared, so a hand-edited or corrupted path
 * degrades to "no drift decided here" rather than to a silently wrong comparison.
 */
export function marketplaceSourceDrift(
  registeredSource: string,
  requestedSource: string,
  context: MarketplaceSourceDriftContext
): MarketplaceSourceDrift | undefined {
  const requested = parseUserBuiltMarketplaceDir(context.userCacheRoot, requestedSource);
  if (requested === undefined) return undefined;
  if (
    !samePathSegment(requested.marketplaceName, context.marketplaceName) ||
    !samePathSegment(requested.target, context.target)
  ) {
    return undefined;
  }
  const registeredShared = parseUserBuiltMarketplaceDir(context.userCacheRoot, registeredSource);
  if (registeredShared !== undefined) {
    if (
      !samePathSegment(registeredShared.marketplaceName, context.marketplaceName) ||
      !samePathSegment(registeredShared.target, context.target)
    ) {
      return undefined;
    }
    if (!isSemver(registeredShared.version) || !isSemver(requested.version)) return undefined;
    if (compareSemver(registeredShared.version, requested.version) <= 0) return undefined;
    return {
      kind: "version-behind",
      registeredVersion: registeredShared.version,
      requestedVersion: requested.version,
    };
  }
  const registeredProject = parseBuiltMarketplaceDir(context.projectRoot, registeredSource);
  if (
    registeredProject !== undefined &&
    samePathSegment(registeredProject.marketplaceName, context.marketplaceName) &&
    samePathSegment(registeredProject.target, context.target)
  ) {
    return { kind: "unmigrated-project-source" };
  }
  const registeredForeign = parseBuiltMarketplaceDirAtAnyRoot(registeredSource);
  if (
    registeredForeign !== undefined &&
    samePathSegment(registeredForeign.marketplaceName, context.marketplaceName) &&
    samePathSegment(registeredForeign.target, context.target) &&
    !samePathSegment(registeredForeign.projectRoot, context.projectRoot)
  ) {
    return {
      kind: "unmigrated-foreign-project-source",
      projectRoot: registeredForeign.projectRoot,
    };
  }
  return undefined;
}
