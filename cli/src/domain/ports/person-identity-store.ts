import type { PersonIdentity, PersonIdentityReader } from "./person-identity-reader.js";

/**
 * What the four `aidd telemetry identity` verbs need beyond `PersonIdentityReader.read()` —
 * extends it rather than sitting beside it, so the one adapter that resolves the identity
 * file implements exactly one port.
 *
 * `read()` promises to never throw, because one local-read sweep must not lose every tool's
 * figures over a damaged identity file. The identity verbs are the opposite question — a
 * person asking what their own state is — so `readStrict()` answers it honestly: a file
 * that exists and could not be read back, or does not parse, throws rather than folding
 * into "nobody chose". Never `AIDD_USER_CONFIG_DIR`-aware, like the reader: the OS user's
 * own profile is the only place this is ever resolved from.
 */
export interface PersonIdentityStore extends PersonIdentityReader {
  /** Where the identity file lives, for messages that name it. */
  readonly filePath: string;

  /** Like `read()`, but surfaces a damaged or unreadable file as a throw instead of `null`. */
  readStrict(): Promise<PersonIdentity | null>;

  /** Generates a fresh identifier and writes it, unconditionally — the caller decides
   * whether one is needed at all; a second mint while one already stands is never this
   * store's call to make. Records `origin: "minted"`. */
  mint(): Promise<PersonIdentity>;

  /** Writes `personId` as this machine's own identifier, taken from elsewhere rather than
   * generated here — records `origin: "adopted"`, and keeps whatever `alsoMe` and
   * `displayName` were already declared, since taking a different canonical identifier is
   * not a reason to forget them. The caller decides whether adopting is the right move at
   * all — reporting "already in effect" for the identifier already in place, or replacing
   * one that differs — this store only ever writes what it is told. */
  adopt(personId: string): Promise<PersonIdentity>;

  /** Adds `identity` to the current identity's `alsoMe`, unconditionally — the caller
   * decides whether a person exists to add onto at all; this store assumes one does.
   * A no-op, not a duplicate, when `identity` is already listed. */
  addAlsoMe(identity: string): Promise<PersonIdentity>;

  /** Withdraws `identity` from the current identity's `alsoMe`, wherever it is. An
   * identifier not listed is nothing to remove, never a failure. */
  removeAlsoMe(identity: string): Promise<PersonIdentity>;

  /** Writes `identity` back with `displayName` attached, replacing any previous one. */
  setDisplayName(identity: PersonIdentity, displayName: string): Promise<PersonIdentity>;

  /** Removes the identity file, answering whether one was actually there. A no-op, not a
   * failure, when there was none.
   *
   * Answers from the filesystem rather than from a parse, because the two disagree: a file
   * holding an empty `person_id` parses to "nobody chose" while still existing on disk, so
   * a caller inferring removal from `readStrict()` would leave it there forever with no
   * verb able to remove it. Only this store can see the file itself. */
  forget(): Promise<boolean>;

  /** The path a stale separate declaration file (`person-mapping.json`) would have lived
   * at beside this one, checked for existence alone and never read - that file was
   * introduced and never released, so there is nothing in it to migrate, only a leftover
   * to name so `status` can say it is ignored and safe to remove. `null` when none is
   * present. */
  staleMappingFilePath(): Promise<string | null>;
}
