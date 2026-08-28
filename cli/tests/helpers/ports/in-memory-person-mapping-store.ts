import type {
  PersonMapping,
  PersonMappingEntry,
} from "../../../src/domain/models/person-mapping.js";
import { validatePersonMapping } from "../../../src/domain/models/person-mapping.js";
import type { PersonMappingStore } from "../../../src/domain/ports/person-mapping-store.js";

/** In-memory double for `PersonMappingStore` — one mapping, or `null`, mutated the way the
 * real adapter's file would be by `link`/`unlink`. `throwOnRead`, when set, is what
 * `readStrict()` throws instead of answering, standing in for a damaged or unreadable
 * mapping file without touching a real one. */
export class InMemoryPersonMappingStore implements PersonMappingStore {
  throwOnRead: Error | null = null;

  constructor(private mapping: PersonMapping | null = null) {}

  get filePath(): string {
    return "/fake/home/.config/aidd/person-mapping.json";
  }

  async read(): Promise<PersonMapping | null> {
    if (this.throwOnRead) return null;
    return this.mapping;
  }

  async readStrict(): Promise<PersonMapping | null> {
    if (this.throwOnRead) throw this.throwOnRead;
    return this.mapping;
  }

  async link(personId: string, identity: string): Promise<PersonMapping> {
    const entries = this.mapping?.entries ?? [];
    const index = entries.findIndex((entry) => entry.personId === personId);
    const entry: PersonMappingEntry =
      index === -1 ? { personId, identities: [identity] } : entries[index];
    const updated =
      index === -1 || entry.identities.includes(identity)
        ? entry
        : { ...entry, identities: [...entry.identities, identity] };
    const nextEntries =
      index === -1 ? [...entries, updated] : entries.map((e, i) => (i === index ? updated : e));
    const next: PersonMapping = { entries: nextEntries };
    validatePersonMapping(next);
    this.mapping = next;
    return next;
  }

  async unlink(identity: string): Promise<PersonMapping> {
    const entries = this.mapping?.entries ?? [];
    const index = entries.findIndex((entry) => entry.identities.includes(identity));
    if (index === -1) return this.mapping ?? { entries: [] };
    const updated = {
      ...entries[index],
      identities: entries[index].identities.filter((raw) => raw !== identity),
    };
    const next: PersonMapping = { entries: entries.map((e, i) => (i === index ? updated : e)) };
    this.mapping = next;
    return next;
  }
}
