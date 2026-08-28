import type { PersonIdentity } from "../ports/person-identity-reader.js";

/**
 * The same three-way reading `stepAttribution` already gives an unknown: never a zero, and
 * it says its own strength.
 *
 * - `"mapped"` — the identifier is this machine's own person: their `personId`, or one of
 *   the identifiers listed in `alsoMe`.
 * - `"unresolved"` — the identifier is real, but nobody's identity covers it.
 * - `"none"` — there was no identifier to resolve at all, a different fact from one nobody
 *   claimed: a record with no identifier says nobody opted in, while an unresolved one says
 *   somebody did, on a machine or under a tool this identity has not heard of yet.
 */
export type PersonResolution = "mapped" | "unresolved" | "none";

/** What resolving one raw identifier against an identity answers. `identities` always
 * carries what produced the row — including the canonical `personId` when mapped, and the
 * raw identifier itself when unresolved — so a caller can show a person line's own evidence
 * without going back to the identity a second time. */
export interface ResolvedPerson {
  readonly resolution: PersonResolution;
  readonly personId?: string;
  readonly displayName?: string;
  readonly identities: readonly string[];
}

function matches(identity: PersonIdentity, rawId: string): boolean {
  return identity.personId === rawId || identity.alsoMe.includes(rawId);
}

/**
 * Resolves one raw identifier against this machine's own identity — `identity` is `null`
 * for no identity declared at all, which resolves every identifier as `unresolved` exactly
 * as an identity that simply does not cover it would, since a report must show every
 * figure the same way whether the gap is "no identity" or "an identity that does not know
 * this identifier".
 *
 * `rawId` undefined or empty answers `"none"` with no identities: nobody opted in is not a
 * failure to resolve, and is never conflated with an identifier this identity failed to
 * place.
 *
 * There is no shape here for two people claiming one identifier — `PersonIdentity`
 * describes exactly one machine's own user, so that ambiguity cannot be constructed, let
 * alone resolved. The type is the guard; no runtime check replaces it.
 */
export function resolvePerson(
  identity: PersonIdentity | null,
  rawId: string | undefined
): ResolvedPerson {
  if (rawId === undefined || rawId === "") return { resolution: "none", identities: [] };
  if (identity === null || !matches(identity, rawId)) {
    return { resolution: "unresolved", identities: [rawId] };
  }
  return {
    resolution: "mapped",
    personId: identity.personId,
    ...(identity.displayName === undefined ? {} : { displayName: identity.displayName }),
    identities: identity.alsoMe.includes(identity.personId)
      ? identity.alsoMe
      : [identity.personId, ...identity.alsoMe],
  };
}
