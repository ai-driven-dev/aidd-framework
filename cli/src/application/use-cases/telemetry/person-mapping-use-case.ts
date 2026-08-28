import type { PersonMapping } from "../../../domain/models/person-mapping.js";
import type { PersonIdentityStore } from "../../../domain/ports/person-identity-store.js";
import type { PersonMappingStore } from "../../../domain/ports/person-mapping-store.js";
import { IdentityRequiredToLinkError } from "../../errors.js";

export interface PersonMappingLinkResult {
  readonly filePath: string;
  readonly personId: string;
  readonly identity: string;
  /** `true` when `identity` already resolved to this same person before this call - a
   * caller that always calls `link` first, then reports, must be able to tell a no-op
   * apart from a fresh write. */
  readonly alreadyListed: boolean;
}

export interface PersonMappingUnlinkResult {
  readonly filePath: string;
  readonly identity: string;
  /** `false` when nobody's mapping listed `identity` at all - reported as nothing to
   * remove, never as a failure. */
  readonly removed: boolean;
}

function findEntry(mapping: PersonMapping | null, personId: string) {
  return mapping?.entries.find((entry) => entry.personId === personId);
}

/**
 * `aidd telemetry identity link`/`unlink` — the two verbs that let a mapping exist at all.
 * Deliberately the *means*, not the deliverable this feature is judged on: the resolution
 * behaviour these verbs feed lives in `domain/models/cost-report.ts`'s `byPeople`.
 *
 * `link` requires an opted-in identity to attach onto — a mapping entry with nobody's own
 * identifier as its anchor is not a person's declaration of anything. `unlink` carries no
 * such requirement: `identity off` deliberately leaves the mapping standing (see
 * `PersonIdentityUseCase.off`), so removing a stale identity from it has to keep working
 * with no local identity opted in at all.
 */
export class PersonMappingUseCase {
  constructor(
    private readonly identityStore: PersonIdentityStore,
    private readonly mappingStore: PersonMappingStore
  ) {}

  async link(identity: string): Promise<PersonMappingLinkResult> {
    const person = await this.identityStore.readStrict();
    if (person === null) throw new IdentityRequiredToLinkError();
    const filePath = this.mappingStore.filePath;
    const before = findEntry(await this.mappingStore.readStrict(), person.personId);
    const alreadyListed = before?.identities.includes(identity) ?? false;
    if (!alreadyListed) await this.mappingStore.link(person.personId, identity);
    return { filePath, personId: person.personId, identity, alreadyListed };
  }

  async unlink(identity: string): Promise<PersonMappingUnlinkResult> {
    const filePath = this.mappingStore.filePath;
    const mapping = await this.mappingStore.readStrict();
    const listed = mapping?.entries.some((entry) => entry.identities.includes(identity)) ?? false;
    if (listed) await this.mappingStore.unlink(identity);
    return { filePath, identity, removed: listed };
  }
}
