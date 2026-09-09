import type { PersonIdentity, PersonIdentityReader } from "./person-identity-reader.js";

/**
 * What the `aidd telemetry identity` verbs need beyond `PersonIdentityReader.read()`, which
 * never throws so a damaged identity file cannot cost a local-read sweep its figures. A
 * person asking about their own state is the opposite question, so `readStrict()` throws
 * there instead of folding into "nobody chose". Resolved from the OS user's own profile only,
 * like the reader.
 */
export interface PersonIdentityStore extends PersonIdentityReader {
  /** Where the identity file lives, for messages that name it. */
  readonly filePath: string;

  /** Like `read()`, but surfaces a damaged or unreadable file as a throw instead of `null`. */
  readStrict(): Promise<PersonIdentity | null>;

  /** Generates a fresh identifier and writes it unconditionally, `origin: "minted"` — whether
   * one is needed at all is the caller's call, never this store's. */
  mint(): Promise<PersonIdentity>;

  /** Writes `personId` as this machine's own identifier, `origin: "adopted"`, keeping the
   * `alsoMe` and `displayName` already declared. Whether adopting is the right move at all is
   * the caller's call; this store only writes what it is told. */
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

  /** Removes the identity file at `path`, answering whether one was actually there — a no-op,
   * not a failure, when there was none. `path` is never resolved here: the caller supplies
   * the exact value a person was already shown, so a removal can never reach a file the
   * preview never named. Answers from the filesystem rather than from a parse, since a file
   * holding an empty `person_id` parses as "nobody chose" while still existing on disk. */
  forget(path: string): Promise<boolean>;
}
