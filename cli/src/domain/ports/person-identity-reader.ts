/** What a person chose to attach to records this machine reads locally — never a name
 * derived from a git author, an email, or a hostname, and never present unless the person
 * turned it on for themselves. `displayName` is a later, separate choice: present only
 * once asked for, absent whenever it was not, independent of `personId`.
 *
 * This is the whole declaration of who this machine's user is: one file, one person,
 * nothing beside it. It can only ever describe this one machine's own user — nothing
 * here can express a second person, so a claim that two people share one identifier
 * cannot be written down at all.
 *
 * `origin` records how this identity came to be, at the only moment that fact is
 * knowable: `"minted"` when this machine generated it, `"adopted"` when it was taken from
 * elsewhere so the same person reads as one across machines. No third value is reserved
 * for a verification nothing can perform — taking an identity is a declaration the tool
 * cannot check, never a proven fact.
 *
 * `alsoMe` holds identifiers this person did not choose here — one kept from before a
 * withdrawal, or a tool's own pseudonymous identifier for them — added onto an identity
 * that already exists. The ordinary way to be one person on two machines is to take the
 * same identity on both (`origin: "adopted"`), not to add one here; `alsoMe` is for the
 * identifiers a person cannot simply carry that way. Required, not optional: an identity
 * with nothing added reads back with an empty array, never an invented one and never an
 * absent field standing in for "none" — only `displayName` uses absence for "not set". */
export interface PersonIdentity {
  readonly personId: string;
  readonly origin: "minted" | "adopted";
  readonly alsoMe: readonly string[];
  readonly displayName?: string;
}

/**
 * What a person identity reader promises: the identifier this machine's own user chose to
 * attach, or `null` when nobody did — a missing file, a damaged one, and a default
 * installation all answer the same way, since none of them is a choice. Never throws: an
 * unreadable identity file costs the identity, not the read a local-read sweep is doing.
 *
 * Deliberately reads only the OS user's own profile — see the adapter — never
 * `AIDD_USER_CONFIG_DIR` and never a project's `.aidd/config.json`. Both are settings a
 * repository or a CI job can set, and this choice is not theirs to make.
 */
export interface PersonIdentityReader {
  read(): Promise<PersonIdentity | null>;
}
