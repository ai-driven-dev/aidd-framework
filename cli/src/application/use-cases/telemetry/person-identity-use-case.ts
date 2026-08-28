import { UnreadableIdentityFileError } from "../../../domain/errors.js";
import type { PersonIdentity } from "../../../domain/ports/person-identity-reader.js";
import type { PersonIdentityStore } from "../../../domain/ports/person-identity-store.js";
import {
  EmptyDisplayNameError,
  EmptyIdentifierError,
  IdentityNotOptedInError,
  IdentityRequiredToLinkError,
} from "../../errors.js";

export interface PersonIdentityStatusResult {
  readonly filePath: string;
  readonly identity: PersonIdentity | null;
  /** Present only when a stale separate declaration file is found beside the identity —
   * that file was introduced and never released, so there is nothing in it to migrate;
   * this only names it as ignored and safe to remove. */
  readonly staleMappingFilePath?: string;
}

export interface PersonIdentityOnResult {
  readonly filePath: string;
  readonly identity: PersonIdentity;
  /** `false` when an identity already stood and this call reports it back, unminted. */
  readonly minted: boolean;
}

export interface PersonIdentityUseResult {
  readonly filePath: string;
  readonly identity: PersonIdentity;
  /** `true` when `identity.personId` was already this machine's own before this call —
   * nothing was written. */
  readonly alreadyInEffect: boolean;
  /** The identifier this replaced — present only when a different one was in effect
   * before, absent both when nothing was declared yet and when the same identifier was
   * already in effect. Records already written keep the identifier they were written
   * with; taking a different one never rewrites them. */
  readonly replacedPersonId?: string;
}

export interface PersonIdentityOffResult {
  readonly filePath: string;
  /** `false` when there was nothing to withdraw. */
  readonly removed: boolean;
  /** `true` when the file existed but could not be read back, and was removed anyway —
   * `off` is a privacy control, and it must work exactly when a damaged file would
   * otherwise leave a person unable to withdraw. */
  readonly discardedDamaged: boolean;
  /** How many identifiers `alsoMe` carried at the moment of withdrawal — `off` removes the
   * whole declaration now, this one file included, so every one of them goes with it. `0`
   * both when none were added and when a damaged file meant this call never learned how
   * many there were. */
  readonly addedIdentifiersRemoved: number;
}

export interface PersonIdentityNameResult {
  readonly filePath: string;
}

export interface PersonIdentityLinkResult {
  readonly filePath: string;
  readonly personId: string;
  readonly identity: string;
  /** `true` when `identity` already resolved to this same person before this call - a
   * caller that always calls `link` first, then reports, must be able to tell a no-op
   * apart from a fresh write. */
  readonly alreadyListed: boolean;
}

export interface PersonIdentityUnlinkResult {
  readonly filePath: string;
  readonly identity: string;
  /** `false` when `identity` was never listed at all - reported as nothing to remove,
   * never as a failure. */
  readonly removed: boolean;
}

/**
 * What `aidd telemetry identity`'s verbs promise, all against the one file that is the
 * whole declaration of who this machine's user is.
 *
 * `status` never changes anything. `on` mints once and reports the same identifier on
 * every call after. `use` takes an identifier minted elsewhere, so the same person reads
 * as one across machines, without a second identity ever being created for them. `link`
 * and `unlink` add or withdraw an identifier this person did not choose here - a tool's
 * own pseudonymous identifier, or one kept from before a withdrawal - onto `alsoMe`. `name`
 * refuses a display name onto nobody, naming `on` as the missing step. `off` withdraws the
 * whole file, added identifiers included.
 *
 * Taking or adding an identifier (`on`, `use`, `link`) is a declaration this tool cannot
 * check - it never verifies that the person running it is who they claim.
 */
export class PersonIdentityUseCase {
  constructor(private readonly store: PersonIdentityStore) {}

  async status(): Promise<PersonIdentityStatusResult> {
    const filePath = this.store.filePath;
    const identity = await this.store.readStrict();
    const staleMappingFilePath = await this.store.staleMappingFilePath();
    return {
      filePath,
      identity,
      ...(staleMappingFilePath === null ? {} : { staleMappingFilePath }),
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

  async use(personId: string): Promise<PersonIdentityUseResult> {
    if (personId.trim() === "") throw new EmptyIdentifierError("use");
    const current = await this.store.readStrict();
    if (current !== null && current.personId === personId) {
      return { filePath: this.store.filePath, identity: current, alreadyInEffect: true };
    }
    const identity = await this.store.adopt(personId);
    return {
      filePath: this.store.filePath,
      identity,
      alreadyInEffect: false,
      ...(current === null ? {} : { replacedPersonId: current.personId }),
    };
  }

  async link(identity: string): Promise<PersonIdentityLinkResult> {
    if (identity.trim() === "") throw new EmptyIdentifierError("link");
    const person = await this.store.readStrict();
    if (person === null) throw new IdentityRequiredToLinkError();
    const alreadyListed = identity === person.personId || person.alsoMe.includes(identity);
    if (!alreadyListed) await this.store.addAlsoMe(identity);
    return { filePath: this.store.filePath, personId: person.personId, identity, alreadyListed };
  }

  async unlink(identity: string): Promise<PersonIdentityUnlinkResult> {
    const person = await this.store.readStrict();
    const removed = person?.alsoMe.includes(identity) ?? false;
    if (removed) await this.store.removeAlsoMe(identity);
    return { filePath: this.store.filePath, identity, removed };
  }

  /**
   * The one verb allowed to swallow `readStrict()`'s throw. `status`, `on`, `use`, `link`
   * and `name` are right to error on a damaged file — the contract's own "the identity
   * file is unreadable" edge case. `off` is different: it is how a person gets out, and a
   * file too damaged to parse is exactly the moment withdrawing must still work. A damaged
   * file is discarded the same as a readable one, and the result says so rather than
   * staying silent about it.
   */
  async off(): Promise<PersonIdentityOffResult> {
    const filePath = this.store.filePath;
    const { existing, discardedDamaged } = await this.readForWithdrawal();
    if (existing === null && !discardedDamaged) {
      return { filePath, removed: false, discardedDamaged, addedIdentifiersRemoved: 0 };
    }
    const addedIdentifiersRemoved = existing?.alsoMe.length ?? 0;
    await this.store.forget();
    return { filePath, removed: true, discardedDamaged, addedIdentifiersRemoved };
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
