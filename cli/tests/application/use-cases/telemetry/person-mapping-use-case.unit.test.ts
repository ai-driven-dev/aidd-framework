import { describe, expect, it } from "vitest";
import { IdentityRequiredToLinkError } from "../../../../src/application/errors.js";
import { PersonMappingUseCase } from "../../../../src/application/use-cases/telemetry/person-mapping-use-case.js";
import { AmbiguousPersonMappingError } from "../../../../src/domain/errors.js";
import { InMemoryPersonIdentityStore } from "../../../helpers/ports/in-memory-person-identity-store.js";
import { InMemoryPersonMappingStore } from "../../../helpers/ports/in-memory-person-mapping-store.js";

function useCase(identity: InMemoryPersonIdentityStore, mapping: InMemoryPersonMappingStore) {
  return new PersonMappingUseCase(identity, mapping);
}

describe("PersonMappingUseCase.link", () => {
  it("refuses when nobody opted in, naming the missing step", async () => {
    const uc = useCase(new InMemoryPersonIdentityStore(null), new InMemoryPersonMappingStore());

    await expect(uc.link("some-other-machine-id")).rejects.toThrow(IdentityRequiredToLinkError);
    await expect(uc.link("some-other-machine-id")).rejects.toThrow(/telemetry identity on/u);
  });

  it("declares both identifiers one person", async () => {
    const identityStore = new InMemoryPersonIdentityStore({ personId: "person-a" });
    const mappingStore = new InMemoryPersonMappingStore();
    const uc = useCase(identityStore, mappingStore);

    const result = await uc.link("machine-2");

    expect(result.alreadyListed).toBe(false);
    expect(result.personId).toBe("person-a");
    const stored = await mappingStore.read();
    expect(stored?.entries).toEqual([{ personId: "person-a", identities: ["machine-2"] }]);
  });

  it("reports an identity already listed as already listed, not as a second write", async () => {
    const identityStore = new InMemoryPersonIdentityStore({ personId: "person-a" });
    const mappingStore = new InMemoryPersonMappingStore({
      entries: [{ personId: "person-a", identities: ["machine-2"] }],
    });
    const uc = useCase(identityStore, mappingStore);

    const result = await uc.link("machine-2");

    expect(result.alreadyListed).toBe(true);
  });

  it("refuses an identity another person already claims, leaving the mapping as it was", async () => {
    const identityStore = new InMemoryPersonIdentityStore({ personId: "person-a" });
    const mappingStore = new InMemoryPersonMappingStore({
      entries: [{ personId: "person-b", identities: ["machine-3"] }],
    });
    const uc = useCase(identityStore, mappingStore);

    await expect(uc.link("machine-3")).rejects.toThrow(AmbiguousPersonMappingError);
    const stored = await mappingStore.read();
    expect(stored?.entries).toEqual([{ personId: "person-b", identities: ["machine-3"] }]);
  });
});

describe("PersonMappingUseCase.unlink", () => {
  it("reports nothing to remove for an identity nobody listed, and exits successfully", async () => {
    const uc = useCase(
      new InMemoryPersonIdentityStore({ personId: "person-a" }),
      new InMemoryPersonMappingStore()
    );

    const result = await uc.unlink("never-linked");

    expect(result.removed).toBe(false);
  });

  it("works with no identity opted in at all - identity off leaves the mapping standing", async () => {
    const mappingStore = new InMemoryPersonMappingStore({
      entries: [{ personId: "person-a", identities: ["machine-2"] }],
    });
    const uc = useCase(new InMemoryPersonIdentityStore(null), mappingStore);

    const result = await uc.unlink("machine-2");

    expect(result.removed).toBe(true);
    const stored = await mappingStore.read();
    expect(stored?.entries).toEqual([{ personId: "person-a", identities: [] }]);
  });
});
