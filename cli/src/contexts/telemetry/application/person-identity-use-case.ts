import {
  EmptyDisplayNameError,
  EmptyIdentifierError,
  IdentityRequiredToLinkError,
  UnreadableIdentityFileError,
} from "../../../kernel/errors.js";
import type { PersonIdentity } from "../domain/ports/person-identity-reader.js";
import type { PersonIdentityStore } from "../domain/ports/person-identity-store.js";

export interface PersonIdentityStatusResult {
  readonly filePath: string;
  readonly identity: PersonIdentity | null;
}

export interface PersonIdentityUseResult {
  readonly filePath: string;
  readonly identity: PersonIdentity;
  /** How this machine came to carry the identifier it now carries.
   *
   * Three values rather than two booleans: `on` used to answer `minted: false` and `use`
   * `alreadyInEffect: true` for the same situation, in two shapes, because they were two
   * commands. One door needs one word, and the word has to keep `origin`'s own distinction
   * visible — an identifier this machine created is not the same fact as one a person
   * carried here from another machine, and no reader of this result may have to guess
   * which. */
  readonly outcome: "minted" | "adopted" | "unchanged";
  /** The identifier this replaced — present only when a different one was in effect
   * before, absent both when nothing was declared yet and when the same identifier was
   * already in effect. Records already written keep the identifier they were written
   * with; taking a different one never rewrites them. */
  readonly replacedPersonId?: string;
  /** The display name this call attached, when one was asked for. Absent when none was —
   * never `""`, which would read as a name someone chose to be empty. */
  readonly displayNameSet?: string;
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
 * `status` never changes anything. `use` settles which identifier this machine carries:
 * without one it mints, reporting the same identifier on every call after; with one it
 * takes an identifier minted elsewhere, so the same person reads as one across machines
 * without a second identity ever being created for them. A display name goes on in the
 * same call, because it is a property of the identifier and not a separate act. `link` and
 * `unlink` add or withdraw an identifier this person did not choose here - a tool's own
 * pseudonymous identifier, or one kept from before a withdrawal - onto `alsoMe`. `off`
 * withdraws the whole file, added identifiers included.
 *
 * Taking or adding an identifier (`use`, `link`) is a declaration this tool cannot check -
 * it never verifies that the person running it is who they claim.
 */
export class PersonIdentityUseCase {
  constructor(private readonly store: PersonIdentityStore) {}

  async status(): Promise<PersonIdentityStatusResult> {
    const filePath = this.store.filePath;
    const identity = await this.store.readStrict();
    return {
      filePath,
      identity,
    };
  }

  /**
   * The one door to "which identifier am I": mint one, take one minted elsewhere, or attach
   * a name to whichever stands — asked once, in the terms a person actually holds them.
   *
   * `identifier` absent mints; present, adopts. That is not a convenience over two verbs, it
   * is the same question with and without an answer already in hand, and `origin` keeps the
   * two apart on disk exactly as before.
   */
  async use(options: {
    identifier?: string;
    displayName?: string;
  }): Promise<PersonIdentityUseResult> {
    if (options.identifier !== undefined && options.identifier.trim() === "") {
      throw new EmptyIdentifierError("use");
    }
    if (options.displayName !== undefined && options.displayName.trim() === "") {
      throw new EmptyDisplayNameError();
    }
    const settled = await this.settleIdentifier(options.identifier);
    const identity =
      options.displayName === undefined
        ? settled.identity
        : await this.store.setDisplayName(settled.identity, options.displayName);
    return {
      filePath: this.store.filePath,
      identity,
      outcome: settled.outcome,
      ...(settled.replacedPersonId === undefined
        ? {}
        : { replacedPersonId: settled.replacedPersonId }),
      ...(options.displayName === undefined ? {} : { displayNameSet: options.displayName }),
    };
  }

  /** Which identifier stands after this call, and how it got there. Split out because the
   * display name is a second, independent decision — folding both into one body would make
   * a rename look like a change of identity. */
  private async settleIdentifier(identifier?: string): Promise<{
    identity: PersonIdentity;
    outcome: PersonIdentityUseResult["outcome"];
    replacedPersonId?: string;
  }> {
    const current = await this.store.readStrict();
    if (identifier === undefined) {
      if (current !== null) return { identity: current, outcome: "unchanged" };
      return { identity: await this.store.mint(), outcome: "minted" };
    }
    if (current !== null && current.personId === identifier) {
      return { identity: current, outcome: "unchanged" };
    }
    const identity = await this.store.adopt(identifier);
    return {
      identity,
      outcome: "adopted",
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
   * The one verb allowed to swallow `readStrict()`'s throw. `status`, `use` and `link` are
   * right to error on a damaged file — the contract's own "the identity
   * file is unreadable" edge case. `off` is different: it is how a person gets out, and a
   * file too damaged to parse is exactly the moment withdrawing must still work. A damaged
   * file is discarded the same as a readable one, and the result says so rather than
   * staying silent about it.
   */
  async off(): Promise<PersonIdentityOffResult> {
    const filePath = this.store.filePath;
    const { existing, discardedDamaged } = await this.readForWithdrawal();
    const addedIdentifiersRemoved = existing?.alsoMe.length ?? 0;
    // Always asks the store, never decides from the read above: a file holding an empty
    // `person_id` reads as "nobody chose" and would have been left on disk by a caller
    // that skipped the removal whenever the read came back empty.
    const removed = await this.store.forget(filePath);
    return { filePath, removed, discardedDamaged, addedIdentifiersRemoved };
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
