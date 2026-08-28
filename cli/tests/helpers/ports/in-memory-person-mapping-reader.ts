import type { PersonMapping } from "../../../src/domain/models/person-mapping.js";
import type { PersonMappingReader } from "../../../src/domain/ports/person-mapping-reader.js";

/** In-memory double for `PersonMappingReader` — one mapping, set once, or `null`. */
export class InMemoryPersonMappingReader implements PersonMappingReader {
  constructor(private mapping: PersonMapping | null = null) {}

  set(mapping: PersonMapping | null): void {
    this.mapping = mapping;
  }

  async read(): Promise<PersonMapping | null> {
    return this.mapping;
  }
}

/** No mapping declared — the default a fresh installation reads, on every call. */
export const NULL_PERSON_MAPPING_READER: PersonMappingReader = {
  read: async () => null,
};
