import {
  withAlsoMeAdded,
  withAlsoMeRemoved,
  withPersonIdAdopted,
} from "../../../src/contexts/telemetry/domain/person-resolution.js";
import type { PersonIdentity } from "../../../src/contexts/telemetry/domain/ports/person-identity-reader.js";
import type { PersonIdentityStore } from "../../../src/contexts/telemetry/domain/ports/person-identity-store.js";

/** In-memory double for `PersonIdentityStore`. `throwOnRead` and `throwOnForget`, when set, are
 * what `readStrict()` and `forget()` throw — a damaged, or an undeletable, identity file. */
export class InMemoryPersonIdentityStore implements PersonIdentityStore {
  mintCount = 0;
  forgetCount = 0;
  throwOnForget: Error | null = null;
  /** The `path` `forget()` actually received: what proves a caller passed the preview's own
   * path, never this double's fixed `filePath`. */
  forgetCalledWithPath: string | null = null;
  /** Whether a file would be on disk. Distinct from `identity`: a real file holding an empty
   * `person_id` parses to `null` while still existing. */
  filePresent: boolean;
  throwOnRead: Error | null = null;

  constructor(
    private identity: PersonIdentity | null = null,
    private readonly nextPersonId = "minted-person-id"
  ) {
    this.filePresent = identity !== null;
  }

  get filePath(): string {
    return "/fake/home/.config/aidd/identity.json";
  }

  async read(): Promise<PersonIdentity | null> {
    return this.identity;
  }

  async readStrict(): Promise<PersonIdentity | null> {
    if (this.throwOnRead) throw this.throwOnRead;
    return this.identity;
  }

  async mint(): Promise<PersonIdentity> {
    this.filePresent = true;
    this.mintCount++;
    this.identity = { personId: this.nextPersonId, origin: "minted", alsoMe: [] };
    return this.identity;
  }

  async adopt(personId: string): Promise<PersonIdentity> {
    this.filePresent = true;
    this.identity = withPersonIdAdopted(this.identity, personId);
    return this.identity;
  }

  async addAlsoMe(identity: string): Promise<PersonIdentity> {
    this.filePresent = true;
    if (this.identity === null) throw new Error("no identity to add onto");
    this.identity = withAlsoMeAdded(this.identity, identity);
    return this.identity;
  }

  async removeAlsoMe(identity: string): Promise<PersonIdentity> {
    this.filePresent = true;
    if (this.identity === null) throw new Error("no identity to remove from");
    this.identity = withAlsoMeRemoved(this.identity, identity);
    return this.identity;
  }

  async setDisplayName(identity: PersonIdentity, displayName: string): Promise<PersonIdentity> {
    this.filePresent = true;
    this.identity = { ...identity, displayName };
    return this.identity;
  }

  async forget(path: string): Promise<boolean> {
    this.forgetCalledWithPath = path;
    if (this.throwOnForget) throw this.throwOnForget;
    this.forgetCount++;
    const wasThere = this.filePresent;
    this.identity = null;
    this.filePresent = false;
    return wasThere;
  }
}
