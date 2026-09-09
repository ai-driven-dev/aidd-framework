import type { HostMarketplaceRegistryReading } from "./ports/host-marketplace-registry-reader.js";

/**
 * What a catalog's own `marketplace.json` declares about itself — the fact that decides whether
 * two directories are the same marketplace or two different ones that happen to share a
 * registered name. Read from the file itself, never from a path. `version` is deliberately
 * absent: identity is the declared name plus the plugin set — see {@link sameCatalog}.
 */
export interface MarketplaceCatalogIdentity {
  readonly name: string;
  readonly pluginNames: readonly string[];
}

/**
 * A marketplace name a host's own registry already holds, pointed at a *different catalog* than
 * the one this project is about to register — the case `claude plugin marketplace add`'s silent
 * overwrite (exit 0, no prompt, `installLocation` simply replaced) actually breaks. A version
 * or migration drift is a separate question, decided from the path's own segments by a caller
 * that then never calls this at all.
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
 * Whether registering `requestedSource` under `expectedName` would silently replace a
 * *different* catalog a host's registry already holds under that name — not merely a different
 * directory. Pure: the caller reads both identities from each source's own `marketplace.json`
 * first.
 *
 * A registry that answers nothing, and a registered source whose own catalog cannot be read,
 * are both unknown rather than a conflict — a dead entry is what a re-add repairs. The same
 * identity reached by two resolved paths is one catalog reached twice, which is what two
 * projects building the same framework fixture measure; refusing it would refuse every second
 * `aidd sync` either of them runs.
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

/** A catalog's identity is its declared name plus its plugin set: a version bump under the same
 * name and the same plugins is the host repointing to a newer build of the marketplace it
 * already knows, so the version is deliberately left out of this comparison. */
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

/** The plugin names a conflict message can point at: what `requested` carries that `registered`
 * does not, and the reverse. Two conflicting identities may differ in the declared name alone,
 * so an empty diff here is legitimate — the name difference is then the fact to report. */
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

/** Renders a {@link pluginSetDifference} result into the fragment doctor's and sync's own
 * conflict messages name the plugins by — one wording, not one written fresh in each caller. */
export function describePluginDiff(diff: {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}): string {
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(`+${diff.added.join(", ")}`);
  if (diff.removed.length > 0) parts.push(`-${diff.removed.join(", ")}`);
  return parts.length > 0 ? `differ (${parts.join(", ")})` : "match, but the declared name differs";
}
