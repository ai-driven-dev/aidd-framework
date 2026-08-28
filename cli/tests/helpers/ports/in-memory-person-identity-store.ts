import type { PersonIdentity } from "../../../src/domain/ports/person-identity-reader.js";
import type { PersonIdentityStore } from "../../../src/domain/ports/person-identity-store.js";

/** In-memory double for `PersonIdentityStore` — one identity, or `null`, mutated the way
 * the real adapter's file would be by `mint`/`setDisplayName`/`forget`. `throwOnRead`, when
 * set, is what `readStrict()` throws instead of answering — standing in for a damaged or
 * unreadable identity file without touching a real one. */
export class InMemoryPersonIdentityStore implements PersonIdentityStore {
  mintCount = 0;
  forgetCount = 0;
  throwOnRead: Error | null = null;

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

  async setDisplayName(identity: PersonIdentity, displayName: string): Promise<PersonIdentity> {
    this.identity = { ...identity, displayName };
    return this.identity;
  }

  async forget(): Promise<void> {
    this.forgetCount++;
    this.identity = null;
  }
}
