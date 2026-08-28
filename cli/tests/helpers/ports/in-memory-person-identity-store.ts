import {
  withAlsoMeAdded,
  withAlsoMeRemoved,
} from "../../../src/domain/models/person-resolution.js";
import type { PersonIdentity } from "../../../src/domain/ports/person-identity-reader.js";
import type { PersonIdentityStore } from "../../../src/domain/ports/person-identity-store.js";

/** In-memory double for `PersonIdentityStore` — one identity, or `null`, mutated the way
 * the real adapter's file would be by `mint`/`adopt`/`addAlsoMe`/`removeAlsoMe`/
 * `setDisplayName`/`forget`. `throwOnRead`, when set, is what `readStrict()` throws instead
 * of answering — standing in for a damaged or unreadable identity file without touching a
 * real one. `staleMappingPath`, when set, is what `staleMappingFilePath()` answers —
 * standing in for a leftover separate declaration file found beside the identity. */
export class InMemoryPersonIdentityStore implements PersonIdentityStore {
  mintCount = 0;
  forgetCount = 0;
  throwOnRead: Error | null = null;
  staleMappingPath: string | null = null;

  constructor(
    private identity: PersonIdentity | null = null,
    private readonly nextPersonId = "minted-person-id"
  ) {}

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
    this.mintCount++;
    this.identity = { personId: this.nextPersonId, origin: "minted", alsoMe: [] };
    return this.identity;
  }

  async adopt(personId: string): Promise<PersonIdentity> {
    this.identity = {
      personId,
      origin: "adopted",
      alsoMe: this.identity?.alsoMe ?? [],
      ...(this.identity?.displayName === undefined
        ? {}
        : { displayName: this.identity.displayName }),
    };
    return this.identity;
  }

  async addAlsoMe(identity: string): Promise<PersonIdentity> {
    if (this.identity === null) throw new Error("no identity to add onto");
    this.identity = withAlsoMeAdded(this.identity, identity);
    return this.identity;
  }

  async removeAlsoMe(identity: string): Promise<PersonIdentity> {
    if (this.identity === null) throw new Error("no identity to remove from");
    this.identity = withAlsoMeRemoved(this.identity, identity);
    return this.identity;
  }

  async setDisplayName(identity: PersonIdentity, displayName: string): Promise<PersonIdentity> {
    this.identity = { ...identity, displayName };
    return this.identity;
  }

  async forget(): Promise<void> {
    this.forgetCount++;
    this.identity = null;
  }

  async staleMappingFilePath(): Promise<string | null> {
    return this.staleMappingPath;
  }
}
