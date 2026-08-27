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
   * store's call to make. */
  mint(): Promise<PersonIdentity>;

  /** Writes `identity` back with `displayName` attached, replacing any previous one. */
  setDisplayName(identity: PersonIdentity, displayName: string): Promise<PersonIdentity>;

  /** Removes the identity file. A no-op, not a failure, when there was none. */
  forget(): Promise<void>;
}
