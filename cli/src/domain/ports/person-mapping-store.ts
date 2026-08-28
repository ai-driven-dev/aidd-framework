import type { PersonMapping } from "../models/person-mapping.js";
import type { PersonMappingReader } from "./person-mapping-reader.js";

/**
 * What `aidd telemetry identity link`/`unlink` and the report path's own caveat need
 * beyond `PersonMappingReader.read()` — extends it rather than sitting beside it, the same
 * way `PersonIdentityStore` extends `PersonIdentityReader`, so the one adapter that
 * resolves the mapping file implements exactly one port.
 *
 * `read()` keeps its inherited promise: never throws, folding an absent and a damaged
 * mapping alike into `null`. `readStrict()` answers the opposite question honestly — a
 * mapping that exists but could not be read back, or does not parse, throws rather than
 * folding into "nothing declared". The report path calls `readStrict()` and catches the
 * throw itself, the same fan-out reasoning `ReadLocalCostUseCase.attemptRead` already
 * documents: a damaged mapping costs the resolution, never the report's own figures, and
 * distinguishing "unreadable" from "absent" is exactly what a caller needs to say why.
 *
 * Never `AIDD_USER_CONFIG_DIR`-aware, like the reader: the OS user's own profile is the
 * only place this is ever resolved from.
 */
export interface PersonMappingStore extends PersonMappingReader {
  /** Where the mapping file lives, for messages that name it. */
  readonly filePath: string;

  /** Like `read()`, but surfaces a damaged, unreadable or ambiguous mapping as a throw
   * instead of `null`. */
  readStrict(): Promise<PersonMapping | null>;

  /** Declares `identity` as `personId`'s own, creating that person's entry if this is its
   * first identity. Throws `AmbiguousPersonMappingError` when `identity` is already listed
   * under a different `personId` rather than moving it — the store never overwrites a
   * claim, only a caller decides that is what should happen, and nothing here does.
   *
   * Takes `personId` explicitly rather than resolving "the current person" itself: *which*
   * person is opted in is `PersonIdentityStore`'s own fact, and asking this store to read
   * that file too would make it implement two ports for one write. The use case that
   * already reads the identity file to refuse "nobody opted in" passes the same value on. */
  link(personId: string, identity: string): Promise<PersonMapping>;

  /** Withdraws `identity` from whichever entry lists it, wherever that is - never scoped
   * to "the current person" the way `link` is. `identity off` deliberately leaves the
   * mapping standing, so unlinking a stale identity has to keep working with no local
   * identity opted in at all; requiring one here would make that promise impossible to
   * keep. An identity nobody lists is nothing to remove, never a failure. Never removes a
   * whole entry, and never matches an entry's own `personId` - only ever the identities
   * linked onto it. */
  unlink(identity: string): Promise<PersonMapping>;
}
