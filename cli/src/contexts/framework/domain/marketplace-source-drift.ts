import {
  parseBuiltMarketplaceDir,
  parseUserBuiltMarketplaceDir,
  samePathSegment,
} from "../../../kernel/paths.js";
import { compareSemver, isSemver } from "../../../kernel/semver.js";

/** What `marketplaceSourceDrift` needs to recognise aidd's own shared-source shape and
 * this project's own pre-migration one, without reading anything: the same three
 * facts `userBuiltMarketplaceDir` and `builtMarketplaceDir` were built from. Every path
 * a caller hands this — `userCacheRoot`, `projectRoot`, and the two sources compared
 * against them — is expected already resolved (`realpath`'d): this decides a migration
 * story about aidd's own version, not a filesystem question, so resolving belongs to
 * the caller that has a `FileReader` in hand, not here.
 */
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
    };

/**
 * Whether a host's registered source names a path this project recognises as its
 * own — one CLI version behind the shared source this run would request, or still
 * the pre-migration per-project cache — decided purely from each path's own
 * segments (`kernel/paths.ts`'s parsers), never from a catalog's declared name or
 * plugin set. `undefined` when the registered path is neither shape: the generic
 * catalog-identity guard, `marketplaceSourceConflict` (`contexts/tools/domain`), is
 * what decides that case, by reading each side's own `marketplace.json`.
 *
 * Deciding this is a fact about aidd's own migration from a per-project cache to a
 * machine-shared one — which CLI version a path belongs to, and whether a path is
 * this project's own pre-migration shape — never a fact a host tool declares about
 * itself, which is why this lives in `framework`, not `tools`
 * (`aidd_docs/memory/architecture.md`'s "concern decides placement" rule).
 *
 * A version segment that is not valid semver is never compared — `isSemver` gates
 * both sides, so a hand-edited or corrupted path degrades to "no drift decided
 * here" rather than to a silently wrong comparison.
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
  return undefined;
}
