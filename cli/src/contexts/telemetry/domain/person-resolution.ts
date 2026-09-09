import type { PersonIdentity } from "./ports/person-identity-reader.js";

/** How a record's person was resolved. `person_id` is stamped at store time, so its absence
 * tracks the identity, not the work; `"this-machine"` holds only while the sink has one writer.
 *
 * - `"mapped"` — this machine's own `personId`, or one of the identifiers in `alsoMe`.
 * - `"unresolved"` — a real identifier nobody's identity covers.
 * - `"this-machine"` — the record carried no identifier and this machine declared an identity.
 * - `"none"` — no identifier **and** no identity: nobody opted in, which unresolved never says. */
export type PersonResolution = "mapped" | "unresolved" | "none" | "this-machine";

/** What resolving one raw identifier against an identity answers. `identities` always carries
 * what produced the row — the canonical `personId` when mapped, the raw identifier when
 * unresolved — so a caller shows a row's evidence without re-reading the identity. */
export interface ResolvedPerson {
  readonly resolution: PersonResolution;
  readonly personId?: string;
  readonly displayName?: string;
  readonly identities: readonly string[];
}

function matches(identity: PersonIdentity, rawId: string): boolean {
  return identity.personId === rawId || identity.alsoMe.includes(rawId);
}

/** One identity, as the person a row names and the evidence behind it — shared by the two routes
 * that end at this machine's own person, so they cannot describe them differently. `alsoMe`
 * cannot contain `personId`: `PersonIdentityUseCase.link` refuses it, so no check belongs here. */
function claimedBy(identity: PersonIdentity): Omit<ResolvedPerson, "resolution"> {
  return {
    personId: identity.personId,
    ...(identity.displayName === undefined ? {} : { displayName: identity.displayName }),
    identities: [identity.personId, ...identity.alsoMe],
  };
}

/** Resolves one raw identifier against this machine's own identity. A `null` `identity` resolves
 * every identifier as `unresolved`, exactly as one that does not cover it would: a report shows
 * both gaps the same way. An empty `rawId` answers `"this-machine"` or `"none"`, and never
 * overrules an identifier the record did carry. */
export function resolvePerson(
  identity: PersonIdentity | null,
  rawId: string | undefined
): ResolvedPerson {
  if (rawId === undefined || rawId === "") {
    return identity === null
      ? { resolution: "none", identities: [] }
      : { ...claimedBy(identity), resolution: "this-machine" };
  }
  if (identity === null || !matches(identity, rawId)) {
    return { resolution: "unresolved", identities: [rawId] };
  }
  return { ...claimedBy(identity), resolution: "mapped" };
}

/** `identity` with `value` added to `alsoMe`, deduplicated, and never the person's own
 * `personId` — the one place this rule is written, so the adapter and its test double share it.
 * A person's own identifier is not an identifier *added onto* them. */
export function withAlsoMeAdded(identity: PersonIdentity, value: string): PersonIdentity {
  return identity.alsoMe.includes(value) || value === identity.personId
    ? identity
    : { ...identity, alsoMe: [...identity.alsoMe, value] };
}

/** `current` re-anchored on `personId`, taken from another machine — keeping what was declared,
 * minus `personId` itself. That subtraction is why this exists instead of a literal in the
 * adapter: `link X` then `use X` is an ordinary sequence, and without it the person's own
 * identifier reads as one added onto themselves. */
export function withPersonIdAdopted(
  current: PersonIdentity | null,
  personId: string
): PersonIdentity {
  return {
    personId,
    origin: "adopted",
    alsoMe: (current?.alsoMe ?? []).filter((raw) => raw !== personId),
    ...(current?.displayName === undefined ? {} : { displayName: current.displayName }),
  };
}

/** `identity` with `value` withdrawn from `alsoMe`, wherever it is — an identifier not
 * listed leaves `alsoMe` unchanged rather than failing. */
export function withAlsoMeRemoved(identity: PersonIdentity, value: string): PersonIdentity {
  return { ...identity, alsoMe: identity.alsoMe.filter((raw) => raw !== value) };
}
