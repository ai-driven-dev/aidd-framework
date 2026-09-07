import type { HostMarketplaceRegistryReading } from "./ports/host-marketplace-registry-reader.js";

/**
 * What a catalog's own `marketplace.json` declares about itself — the fact that
 * decides whether two directories are "the same marketplace" or two different ones
 * that happen to share a registered name. Read from the file itself, never from a
 * path: two real projects on one machine both auto-registering `aidd-framework` from
 * their own, separate `.aidd/cache/built/…` measure exactly this — same `name`, same
 * `pluginNames`, different directory — and that is not a conflict, it is one catalog
 * reached two ways.
 *
 * `version` is deliberately absent: a catalog's identity is its declared name plus
 * its plugin set, never the version stamped on either — see {@link sameCatalog}.
 */
export interface MarketplaceCatalogIdentity {
  readonly name: string;
  readonly pluginNames: readonly string[];
}

/**
 * A marketplace name a host's own registry already holds, pointed at a *different
 * catalog* than the one this project is about to register — the fact behind
 * `claude plugin marketplace add`'s silent overwrite (measured: exit 0, no prompt,
 * `installLocation` simply replaced), narrowed to the case that overwrite actually
 * breaks: a name that used to mean one plugin set now silently means another.
 *
 * A version or migration drift is a separate question, decided from the path's own
 * segments before this is ever computed — `cli/src/contexts/framework/domain/marketplace-source-drift.ts`'s
 * `marketplaceSourceDrift`, which this module does not call: that fact is a story
 * about aidd's own migration, not about a host's registry, and a caller that wants
 * it decides it first and never calls this function at all when it finds one (see
 * `contexts/framework/application/shared/host-marketplace-source-conflict.ts`).
 */
export interface MarketplaceSourceConflict {
  readonly name: string;
  /** What the host's registry currently resolves this name to. */
  readonly registeredSource: string;
  /** What this project is about to ask the host to register it as instead. */
  readonly requestedSource: string;
  readonly registeredIdentity: MarketplaceCatalogIdentity;
  readonly requestedIdentity: MarketplaceCatalogIdentity;
  /** The file the reading came from, so the message names something a person can open. */
  readonly location: string;
}

/**
 * Whether registering `requestedSource` under `expectedName` would silently replace
 * a *different* catalog a host's registry already holds under that name — not merely
 * a different directory.
 *
 * Pure: both identities must already be read (from each source's own `marketplace.json`)
 * by the caller — this function only compares values. Rules, in order:
 *
 * - a registry with no entries at all answers no conflict, whichever of the two ways
 *   `entries` came back absent: the file has never existed (`reading.absent`) or it
 *   exists but could not be read or parsed (`reading.unreadable`). This function does
 *   not need to tell the two apart — both are "unknown", and unknown is never a zero:
 *   a caller that cannot ask the host must not invent an answer for it, the same rule
 *   {@link answeredRegistry} already holds for a plugin ref. `clean`'s own cache purge
 *   is the one caller that does tell them apart, because its two answers differ:
 *   nothing ever named there is safe to purge, something unread is not.
 * - a name absent from the registry answers no conflict — nothing is held yet.
 * - a registered source whose own catalog could not be read (`registeredIdentity`
 *   absent) answers no conflict: a dead entry, most often a directory that no longer
 *   exists, is not a fact to hold hostage — it is exactly what a re-add repairs.
 * - the same catalog identity (the declared name, and the same set of plugin names —
 *   never the version) answers no conflict, whatever the two resolved paths are:
 *   this is what two independent projects on one machine both building the same
 *   framework fixture to their own `.aidd/cache/` measure, and Claude repointing
 *   `installLocation` between them is without consequence — refusing it would refuse
 *   every second `aidd sync` two such projects ever run. A version bump alone, same
 *   name and same plugin set, is an *update*: the host repoints to the newer build,
 *   and a project still holding the older one is not in conflict with it — `doctor`
 *   has nothing to reproach as long as the name and the plugin set still agree.
 * - anything else — the same name, a *different* catalog — is a conflict, carrying
 *   both identities so the message can name both sources and the plugin names that
 *   differ.
 */
export function marketplaceSourceConflict(
  reading: HostMarketplaceRegistryReading,
  expectedName: string,
  requestedSource: string,
  registeredIdentity: MarketplaceCatalogIdentity | undefined,
  requestedIdentity: MarketplaceCatalogIdentity
): MarketplaceSourceConflict | undefined {
  if (reading.entries === undefined) return undefined;
  const registeredSource = reading.entries.get(expectedName);
  if (registeredSource === undefined) return undefined;
  if (registeredIdentity === undefined) return undefined;
  if (sameCatalog(registeredIdentity, requestedIdentity)) return undefined;
  return {
    name: expectedName,
    registeredSource,
    requestedSource,
    registeredIdentity,
    requestedIdentity,
    location: reading.location,
  };
}

/**
 * A catalog's identity is its declared name plus its plugin set — a decision, not an
 * omission: a version bump under the same name and the same plugins is the host
 * repointing to a newer build of the marketplace it already knows, not a different
 * marketplace, so it is deliberately left out of this comparison.
 */
function sameCatalog(a: MarketplaceCatalogIdentity, b: MarketplaceCatalogIdentity): boolean {
  return a.name === b.name && samePluginNames(a.pluginNames, b.pluginNames);
}

/** Order-independent: what a catalog declares is a set of plugins, not a sequence. */
function samePluginNames(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((name, index) => name === sortedB[index]);
}

/**
 * Names the plugin names a conflict message can point at: what `requested` carries
 * that `registered` does not, and what `registered` carries that `requested` does
 * not. A conflict's two identities always differ in at least the name or the plugin
 * set (see {@link sameCatalog}), so a caller whose declared names already differ may
 * still get an empty diff here — the name difference alone is the fact to report.
 */
export function pluginSetDifference(
  registered: MarketplaceCatalogIdentity,
  requested: MarketplaceCatalogIdentity
): { readonly added: readonly string[]; readonly removed: readonly string[] } {
  const registeredNames = new Set(registered.pluginNames);
  const requestedNames = new Set(requested.pluginNames);
  return {
    added: requested.pluginNames.filter((name) => !registeredNames.has(name)),
    removed: registered.pluginNames.filter((name) => !requestedNames.has(name)),
  };
}

/** Renders a {@link pluginSetDifference} result into the fragment both doctor's and
 * sync's own conflict messages name the plugins by — one wording, not one written
 * fresh in each caller. */
export function describePluginDiff(diff: {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}): string {
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(`+${diff.added.join(", ")}`);
  if (diff.removed.length > 0) parts.push(`-${diff.removed.join(", ")}`);
  return parts.length > 0 ? `differ (${parts.join(", ")})` : "match, but the declared name differs";
}
