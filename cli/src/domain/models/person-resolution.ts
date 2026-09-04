import type { PersonIdentity } from "../ports/person-identity-reader.js";

/**
 * The same three-way reading `stepAttribution` already gives an unknown: never a zero, and
 * it says its own strength.
 *
 * - `"mapped"` — the identifier is this machine's own person: their `personId`, or one of
 *   the identifiers listed in `alsoMe`.
 * - `"unresolved"` — the identifier is real, but nobody's identity covers it.
 * - `"this-machine"` — the record carried no identifier of its own, and this machine has
 *   declared an identity. Not folded into `"mapped"`, which is the record naming a person
 *   this identity claims; this is the identity claiming a record that named nobody.
 *
 *   It exists because `person_id` is stamped when a record is *stored*
 *   (`stampProvenanceAndTool`), so whether a record carries one depends on when the identity
 *   was declared relative to when that record was read - never on the work itself. Two reads
 *   of one sink, with one `identity.json`, answered differently depending on the order those
 *   two things happened in. Measured on a live machine: 29,207 requests, every one read by
 *   that machine's own `aidd`, and `by_person` could name none of them.
 *
 *   Sound because the sink has exactly one writer - `read-local-cost-use-case.ts` is the
 *   only caller of `TelemetrySink.appendRecord`, and every line it writes carries
 *   `provenance: "local-read"`. A record in this sink was read by this machine's own reader,
 *   and this machine has said who that is. If a second writer is ever added, this branch is
 *   the one that stops being true.
 * - `"none"` — there was no identifier to resolve **and** no identity declared, a different
 *   fact from one nobody claimed: it says nobody opted in, while an unresolved one says
 *   somebody did, on a machine or under a tool this identity has not heard of yet.
 */
export type PersonResolution = "mapped" | "unresolved" | "none" | "this-machine";

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

/** One identity, as the person a row names and the evidence behind it — shared by the two
 * routes that end at this machine's own person so they cannot describe them differently.
 *
 * `alsoMe` can no longer contain `identity.personId` itself: `link` treats an identifier
 * equal to the person's own as already listed and refuses to append it
 * (`PersonIdentityUseCase.link`). No runtime check replaces that guard here — do not
 * reintroduce a branch for a shape `link` no longer lets anyone write. */
function claimedBy(identity: PersonIdentity): Omit<ResolvedPerson, "resolution"> {
  return {
    personId: identity.personId,
    ...(identity.displayName === undefined ? {} : { displayName: identity.displayName }),
    identities: [identity.personId, ...identity.alsoMe],
  };
}

/**
 * Resolves one raw identifier against this machine's own identity — `identity` is `null`
 * for no identity declared at all, which resolves every identifier as `unresolved` exactly
 * as an identity that simply does not cover it would, since a report must show every
 * figure the same way whether the gap is "no identity" or "an identity that does not know
 * this identifier".
 *
 * `rawId` undefined or empty answers `"this-machine"` when an identity is declared, and
 * `"none"` with no identities when none is - nobody opted in is not a failure to resolve,
 * and neither is ever conflated with an identifier this identity failed to place. The
 * fallback is reached only when the record named nobody: an identifier it did carry is
 * resolved on its own merits, mapped or unresolved, and this never overrules it.
 *
 * There is no shape here for two people claiming one identifier — `PersonIdentity`
 * describes exactly one machine's own user, so that ambiguity cannot be constructed, let
 * alone resolved. The type is the guard; no runtime check replaces it.
 */
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
 * `personId` — the one place this rule is written, so the real adapter and its in-memory
 * test double share it rather than each reimplementing the same merge.
 *
 * The `personId` half is the invariant `resolvePerson` relies on rather than re-checking:
 * a person's own identifier is not an identifier *added onto* them. Both writers go
 * through here, so the shape cannot be written at all. */
export function withAlsoMeAdded(identity: PersonIdentity, value: string): PersonIdentity {
  return identity.alsoMe.includes(value) || value === identity.personId
    ? identity
    : { ...identity, alsoMe: [...identity.alsoMe, value] };
}

/** `current` re-anchored on `personId`, taken from another machine rather than generated
 * here — keeping whatever was already declared, minus `personId` itself.
 *
 * That subtraction is the whole reason this exists instead of a literal in the adapter.
 * Adding an identifier and then adopting it is an ordinary sequence (`link X`, later
 * `use X`), and without it the person's own identifier lands in the list of identifiers
 * added onto them: `status` prints it as added onto themselves, and `resolvePerson` names
 * it twice as the evidence behind one row. Refused where it would be written, so nothing
 * downstream has to filter it where it is read. */
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
