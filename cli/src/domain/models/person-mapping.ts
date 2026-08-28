import { AmbiguousPersonMappingError } from "../errors.js";

/**
 * One person's own declaration of which raw identifiers are them, and nothing more.
 *
 * `identities` are opaque strings — no per-tool pseudonymous identifier reaches a record
 * today (no `enduser.pseudo.id` anywhere in this codebase or the plugin, and the OTLP
 * attribute allowlist excludes every user field), so this shape carries whatever a route
 * eventually captures without changing the day one does. `personId` is itself a valid
 * member of its own `identities` set for lookup purposes — see `resolvePerson` — a person
 * can always be found by their own canonical identifier, not only by the ones they linked.
 *
 * `displayName` is carried and never produced: nothing here derives it, requires it, or
 * decides whether an identity is a name or a pseudonym — that choice belongs to decision
 * issue #660, and this shape stays silent on it either way.
 */
export interface PersonMappingEntry {
  readonly personId: string;
  readonly identities: readonly string[];
  readonly displayName?: string;
}

export interface PersonMapping {
  readonly entries: readonly PersonMappingEntry[];
}

/**
 * The same three-way reading `stepAttribution` already gives an unknown: never a zero, and
 * it says its own strength.
 *
 * - `"mapped"` — the identifier is one a person declared as theirs.
 * - `"unresolved"` — the identifier is real, but nobody's mapping covers it.
 * - `"none"` — there was no identifier to resolve at all, a different fact from one nobody
 *   claimed: a record with no identifier says nobody opted in, while an unresolved one says
 *   somebody did, on a machine or under a tool this mapping has not heard of yet.
 */
export type PersonResolution = "mapped" | "unresolved" | "none";

/** What resolving one raw identifier against a mapping answers. `identities` always carries
 * what produced the row — including the canonical `personId` when mapped, and the raw
 * identifier itself when unresolved — so a caller can show a person line's own evidence
 * without going back to the mapping a second time. */
export interface ResolvedPerson {
  readonly resolution: PersonResolution;
  readonly personId?: string;
  readonly displayName?: string;
  readonly identities: readonly string[];
}

function findEntry(mapping: PersonMapping, rawId: string): PersonMappingEntry | undefined {
  return mapping.entries.find(
    (entry) => entry.personId === rawId || entry.identities.includes(rawId)
  );
}

/**
 * Resolves one raw identifier against a mapping — `mapping` is `null` for no mapping
 * declared at all, which resolves every identifier as `unresolved` exactly as a mapping
 * that simply does not cover it would, since a report must show every figure the same way
 * whether the gap is "no mapping" or "a mapping that does not know this identifier".
 *
 * `rawId` undefined or empty answers `"none"` with no identities: nobody opted in is not a
 * failure to resolve, and is never conflated with an identifier a mapping failed to place.
 */
export function resolvePerson(
  mapping: PersonMapping | null,
  rawId: string | undefined
): ResolvedPerson {
  if (rawId === undefined || rawId === "") return { resolution: "none", identities: [] };
  const entry = mapping === null ? undefined : findEntry(mapping, rawId);
  if (entry === undefined) return { resolution: "unresolved", identities: [rawId] };
  return {
    resolution: "mapped",
    personId: entry.personId,
    ...(entry.displayName === undefined ? {} : { displayName: entry.displayName }),
    identities: entry.identities.includes(entry.personId)
      ? entry.identities
      : [entry.personId, ...entry.identities],
  };
}

/**
 * Refuses a mapping where one identity is claimed by two different people, naming both —
 * silently picking one of the two claimants would be exactly the merge the contract
 * forbids, done quietly instead of refused out loud.
 *
 * An identity repeated inside one person's own `identities` is not ambiguity: it still
 * resolves to that one person, so this only ever flags a raw identifier that two distinct
 * `personId`s both list.
 *
 * Deliberately separate from `resolvePerson`: validation and resolution answer different
 * questions, and a caller decides what a refusal costs. A report keeps its figures and
 * shows the offending identifiers as unresolved rather than erroring the whole read; the
 * identity command that would have written the second claim errors outright.
 *
 * Checks `personId` itself alongside `identities`, on every entry - `resolvePerson`'s own
 * lookup treats a match on `personId` exactly like a match inside `identities`, so a
 * mapping where one entry's `personId` collides with a raw identity another entry claims
 * is exactly as ambiguous as two entries' `identities` colliding, and has to be refused the
 * same way.
 */
export function validatePersonMapping(mapping: PersonMapping): void {
  const claimedBy = new Map<string, string>();
  for (const entry of mapping.entries) {
    for (const identity of new Set([entry.personId, ...entry.identities])) {
      const existing = claimedBy.get(identity);
      if (existing !== undefined && existing !== entry.personId) {
        throw new AmbiguousPersonMappingError(identity, existing, entry.personId);
      }
      claimedBy.set(identity, entry.personId);
    }
  }
}
