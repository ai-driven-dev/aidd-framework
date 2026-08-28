import { UnreadableIdentityFileError } from "../../../domain/errors.js";
import { type PersonMapping, resolvePerson } from "../../../domain/models/person-mapping.js";
import type { PersonIdentity } from "../../../domain/ports/person-identity-reader.js";
import type { PersonIdentityStore } from "../../../domain/ports/person-identity-store.js";
import type { PersonMappingStore } from "../../../domain/ports/person-mapping-store.js";
import { EmptyDisplayNameError, IdentityNotOptedInError } from "../../errors.js";

export interface PersonIdentityStatusResult {
  readonly filePath: string;
  readonly identity: PersonIdentity | null;
  readonly mappingFilePath: string;
  /** Every identity mapped to this person, their own canonical one included — present
   * only while opted in, since a withdrawn identity carries no `personId` to resolve.
   * Read with the mapping's own best-effort `read()`, never `readStrict()`: a damaged
   * mapping is this call's own business to survive, not a reason to fail `status`
   * reporting the identity it *does* know about. */
  readonly mappedIdentities?: readonly string[];
  /** The canonical identifier the mapping resolves this machine's own identifier to.
   * Ordinarily the same value as `identity.personId`, but not always: this machine's own
   * identifier can itself have been linked onto a different canonical entry from another
   * machine, and a person can only tell which is which if the two are shown distinctly
   * rather than folded into one label. Present alongside `mappedIdentities`. */
  readonly canonicalPersonId?: string;
}

export interface PersonIdentityOnResult {
  readonly filePath: string;
  readonly identity: PersonIdentity;
  /** `false` when an identity already stood and this call reports it back, unminted. */
  readonly minted: boolean;
}

export interface PersonIdentityOffResult {
  readonly filePath: string;
  /** `false` when there was nothing to withdraw. */
  readonly removed: boolean;
  /** `true` when the file existed but could not be read back, and was removed anyway —
   * `off` is a privacy control, and it must work exactly when a damaged file would
   * otherwise leave a person unable to withdraw. */
  readonly discardedDamaged: boolean;
  /** `true` when the identifier just withdrawn still appears in the mapping. `off` means
   * new records carry no person; it is not a mandate to destroy a person's own declaration
   * of which identifiers are them, so the mapping is never touched here — this says so
   * rather than leaving it silent. Always `false` when nothing was withdrawn, or a damaged
   * identity file meant this call never learned which identifier to check. */
  readonly mappingStillListsIdentity: boolean;
}

export interface PersonIdentityNameResult {
  readonly filePath: string;
}

function listsIdentity(mapping: PersonMapping | null, identity: string): boolean {
  return (
    mapping?.entries.some(
      (entry) => entry.personId === identity || entry.identities.includes(identity)
    ) ?? false
  );
}

interface MappingView {
  readonly canonicalPersonId: string;
  readonly identities: readonly string[];
}

/** What the mapping says about `personId` - reusing `resolvePerson`'s own search (so this
 * machine's identifier is found even when it was linked onto a *different* canonical entry
 * from elsewhere, not only when it is an entry's own `personId`), but reading a `null` or
 * non-matching mapping as "just yourself" rather than `resolvePerson`'s `"unresolved"`:
 * `status` is asking "what does the mapping say about me", not "how would a report resolve
 * me", and a report's `"unresolved"` would misdescribe nobody ever having declared one at
 * all as if this person were an unplaced stranger. */
function mappingViewFor(mapping: PersonMapping | null, personId: string): MappingView {
  const resolved = mapping === null ? null : resolvePerson(mapping, personId);
  if (resolved === null || resolved.resolution !== "mapped") {
    return { canonicalPersonId: personId, identities: [personId] };
  }
  return { canonicalPersonId: resolved.personId ?? personId, identities: resolved.identities };
}

/**
 * What `aidd telemetry identity`'s four verbs promise. `status` never changes anything;
 * `on` mints once and reports the same identifier on every call after; `name` refuses a
 * display name onto nobody, naming `on` as the missing step; `off` withdraws the file
 * without touching a record already written with the identifier it held, or the mapping
 * that may still list it.
 *
 * Depends on `PersonMappingStore` for one reason only — telling a person what their own
 * mapping says about them, and whether it still lists an identifier they just withdrew.
 * Never calls `link`/`unlink` on it: declaring an identity is `PersonMappingUseCase`'s own
 * job, kept separate so this class's four verbs stay about the identity file alone.
 */
export class PersonIdentityUseCase {
  constructor(
    private readonly store: PersonIdentityStore,
    private readonly mappingStore: PersonMappingStore
  ) {}

  async status(): Promise<PersonIdentityStatusResult> {
    const filePath = this.store.filePath;
    const mappingFilePath = this.mappingStore.filePath;
    const identity = await this.store.readStrict();
    if (identity === null) return { filePath, identity, mappingFilePath };
    const view = mappingViewFor(await this.mappingStore.read(), identity.personId);
    return {
      filePath,
      identity,
      mappingFilePath,
      mappedIdentities: view.identities,
      canonicalPersonId: view.canonicalPersonId,
    };
  }

  async on(): Promise<PersonIdentityOnResult> {
    const existing = await this.store.readStrict();
    if (existing !== null) {
      return { filePath: this.store.filePath, identity: existing, minted: false };
    }
    const identity = await this.store.mint();
    return { filePath: this.store.filePath, identity, minted: true };
  }

  /**
   * The one verb allowed to swallow `readStrict()`'s throw. `status`, `on` and `name` are
   * right to error on a damaged file — the contract's own "the identity file is unreadable"
   * edge case. `off` is different: it is how a person gets out, and a file too damaged to
   * parse is exactly the moment withdrawing must still work. A damaged file is discarded
   * the same as a readable one, and the result says so rather than staying silent about it.
   */
  async off(): Promise<PersonIdentityOffResult> {
    const filePath = this.store.filePath;
    const { existing, discardedDamaged } = await this.readForWithdrawal();
    if (existing === null && !discardedDamaged) {
      return { filePath, removed: false, discardedDamaged, mappingStillListsIdentity: false };
    }
    const mappingStillListsIdentity =
      existing !== null && listsIdentity(await this.mappingStore.read(), existing.personId);
    await this.store.forget();
    return { filePath, removed: true, discardedDamaged, mappingStillListsIdentity };
  }

  async name(displayName: string): Promise<PersonIdentityNameResult> {
    if (displayName.trim() === "") throw new EmptyDisplayNameError();
    const existing = await this.store.readStrict();
    if (existing === null) throw new IdentityNotOptedInError();
    await this.store.setDisplayName(existing, displayName);
    return { filePath: this.store.filePath };
  }

  private async readForWithdrawal(): Promise<{
    existing: PersonIdentity | null;
    discardedDamaged: boolean;
  }> {
    try {
      return { existing: await this.store.readStrict(), discardedDamaged: false };
    } catch (error) {
      if (error instanceof UnreadableIdentityFileError) {
        return { existing: null, discardedDamaged: true };
      }
      throw error;
    }
  }
}
