import { UnreadableIdentityFileError } from "../../../domain/errors.js";
import type { PersonIdentity } from "../../../domain/ports/person-identity-reader.js";
import type { PersonIdentityStore } from "../../../domain/ports/person-identity-store.js";
import { EmptyDisplayNameError, IdentityNotOptedInError } from "../../errors.js";

export interface PersonIdentityStatusResult {
  readonly filePath: string;
  readonly identity: PersonIdentity | null;
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
}

export interface PersonIdentityNameResult {
  readonly filePath: string;
}

/**
 * What `aidd telemetry identity`'s four verbs promise. `status` never changes anything;
 * `on` mints once and reports the same identifier on every call after; `name` refuses a
 * display name onto nobody, naming `on` as the missing step; `off` withdraws the file
 * without touching a record already written with the identifier it held.
 */
export class PersonIdentityUseCase {
  constructor(private readonly store: PersonIdentityStore) {}

  async status(): Promise<PersonIdentityStatusResult> {
    return { filePath: this.store.filePath, identity: await this.store.readStrict() };
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
    if (existing === null && !discardedDamaged)
      return { filePath, removed: false, discardedDamaged };
    await this.store.forget();
    return { filePath, removed: true, discardedDamaged };
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
