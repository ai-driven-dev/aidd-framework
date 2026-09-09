import type {
  PersonIdentity,
  PersonIdentityReader,
} from "../../../src/contexts/telemetry/domain/ports/person-identity-reader.js";

/** In-memory double for `PersonIdentityReader` — one identity, set once, or `null`. */
export class InMemoryPersonIdentityReader implements PersonIdentityReader {
  constructor(private identity: PersonIdentity | null = null) {}

  set(identity: PersonIdentity | null): void {
    this.identity = identity;
  }

  async read(): Promise<PersonIdentity | null> {
    return this.identity;
  }
}

/** Nobody opted in — the default a fresh installation reads, on every call. */
export const NULL_PERSON_IDENTITY_READER: PersonIdentityReader = {
  read: async () => null,
};
