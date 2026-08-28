import { describe, expect, it } from "vitest";
import {
  EmptyDisplayNameError,
  EmptyIdentifierError,
  IdentityNotOptedInError,
  IdentityRequiredToLinkError,
} from "../../../../src/application/errors.js";
import { PersonIdentityUseCase } from "../../../../src/application/use-cases/telemetry/person-identity-use-case.js";
import { UnreadableIdentityFileError } from "../../../../src/domain/errors.js";
import { InMemoryPersonIdentityStore } from "../../../helpers/ports/in-memory-person-identity-store.js";

function useCase(store: InMemoryPersonIdentityStore): PersonIdentityUseCase {
  return new PersonIdentityUseCase(store);
}

describe("PersonIdentityUseCase.status", () => {
  it("answers no identity when nobody opted in", async () => {
    const result = await useCase(new InMemoryPersonIdentityStore(null)).status();

    expect(result.identity).toBeNull();
  });

  it("answers an identity with no name and no added identifiers", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
    });

    const result = await useCase(store).status();

    expect(result.identity).toEqual({ personId: "person-1", origin: "minted", alsoMe: [] });
  });

  it("answers an identity with a name", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
      displayName: "Baptiste",
    });

    const result = await useCase(store).status();

    expect(result.identity).toEqual({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
      displayName: "Baptiste",
    });
  });

  it("throws, never answers 'no identity', when the store cannot be read", async () => {
    const store = new InMemoryPersonIdentityStore(null);
    store.throwOnRead = new Error("identity.json is a directory");

    await expect(useCase(store).status()).rejects.toThrow("identity.json is a directory");
  });

  it("lists every identifier added onto this person, including how it was obtained", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "adopted",
      alsoMe: ["a-second-machine"],
    });

    const result = await useCase(store).status();

    expect(result.identity?.origin).toBe("adopted");
    expect(result.identity?.alsoMe).toEqual(["a-second-machine"]);
  });

  it("names a stale separate declaration file as ignored and safe to remove", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
    });
    store.staleMappingPath = "/fake/home/.config/aidd/person-mapping.json";

    const result = await useCase(store).status();

    expect(result.staleMappingFilePath).toBe("/fake/home/.config/aidd/person-mapping.json");
  });

  it("names no stale file when none is present", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
    });

    const result = await useCase(store).status();

    expect(result).not.toHaveProperty("staleMappingFilePath");
  });
});

describe("PersonIdentityUseCase.on", () => {
  it("mints an identifier when none exists", async () => {
    const store = new InMemoryPersonIdentityStore(null, "fresh-id");

    const result = await useCase(store).on();

    expect(result.minted).toBe(true);
    expect(result.identity).toEqual({ personId: "fresh-id", origin: "minted", alsoMe: [] });
    expect(store.mintCount).toBe(1);
  });

  it("a second on reports the same identifier, never a new one", async () => {
    const store = new InMemoryPersonIdentityStore(
      { personId: "existing-id", origin: "minted", alsoMe: [] },
      "fresh-id"
    );

    const result = await useCase(store).on();

    expect(result.minted).toBe(false);
    expect(result.identity).toEqual({ personId: "existing-id", origin: "minted", alsoMe: [] });
    expect(store.mintCount).toBe(0);
  });
});

describe("PersonIdentityUseCase.use", () => {
  it("refuses an empty or whitespace-only identifier, writing nothing", async () => {
    const store = new InMemoryPersonIdentityStore(null);

    await expect(useCase(store).use("   ")).rejects.toThrow(EmptyIdentifierError);
    expect(await store.read()).toBeNull();
  });

  it("takes an identifier minted elsewhere, recording it as adopted", async () => {
    const store = new InMemoryPersonIdentityStore(null);

    const result = await useCase(store).use("machine-1-id");

    expect(result.alreadyInEffect).toBe(false);
    expect(result.identity).toEqual({ personId: "machine-1-id", origin: "adopted", alsoMe: [] });
    expect(result.replacedPersonId).toBeUndefined();
  });

  it("reports the identifier already in effect, and writes nothing", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "machine-1-id",
      origin: "minted",
      alsoMe: [],
    });

    const result = await useCase(store).use("machine-1-id");

    expect(result.alreadyInEffect).toBe(true);
    expect(await store.read()).toEqual({
      personId: "machine-1-id",
      origin: "minted",
      alsoMe: [],
    });
  });

  it("replaces a different identifier, naming what it replaced", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "old-id",
      origin: "minted",
      alsoMe: [],
    });

    const result = await useCase(store).use("new-id");

    expect(result.alreadyInEffect).toBe(false);
    expect(result.replacedPersonId).toBe("old-id");
    expect(result.identity.personId).toBe("new-id");
    expect(result.identity.origin).toBe("adopted");
  });

  it("keeps alsoMe already declared when adopting a different identifier", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "old-id",
      origin: "minted",
      alsoMe: ["kept-identifier"],
    });

    const result = await useCase(store).use("new-id");

    expect(result.identity.alsoMe).toEqual(["kept-identifier"]);
  });
});

describe("PersonIdentityUseCase.link", () => {
  it("refuses an empty or whitespace-only identifier, writing nothing", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-a",
      origin: "minted",
      alsoMe: [],
    });

    await expect(useCase(store).link("   ")).rejects.toThrow(EmptyIdentifierError);
    expect((await store.read())?.alsoMe).toEqual([]);
  });

  it("refuses when nobody opted in, naming the missing step", async () => {
    const uc = useCase(new InMemoryPersonIdentityStore(null));

    await expect(uc.link("some-other-machine-id")).rejects.toThrow(IdentityRequiredToLinkError);
    await expect(uc.link("some-other-machine-id")).rejects.toThrow(/telemetry identity on/u);
  });

  it("reports the person's own identifier as already listed, and appends nothing onto alsoMe", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-a",
      origin: "minted",
      alsoMe: [],
    });

    const result = await useCase(store).link("person-a");

    expect(result.alreadyListed).toBe(true);
    expect((await store.read())?.alsoMe).toEqual([]);
  });

  it("adds the identifier onto this person", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-a",
      origin: "minted",
      alsoMe: [],
    });

    const result = await useCase(store).link("machine-2");

    expect(result.alreadyListed).toBe(false);
    expect(result.personId).toBe("person-a");
    expect((await store.read())?.alsoMe).toEqual(["machine-2"]);
  });

  it("reports an identifier already listed as already listed, not as a second write", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-a",
      origin: "minted",
      alsoMe: ["machine-2"],
    });

    const result = await useCase(store).link("machine-2");

    expect(result.alreadyListed).toBe(true);
  });
});

describe("PersonIdentityUseCase.unlink", () => {
  it("reports nothing to remove for an empty identifier, never as a failure - link already refuses to write one", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-a",
      origin: "minted",
      alsoMe: [],
    });

    const result = await useCase(store).unlink("");

    expect(result.removed).toBe(false);
  });

  it("reports nothing to remove for an identifier nobody listed, and exits successfully", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-a",
      origin: "minted",
      alsoMe: [],
    });

    const result = await useCase(store).unlink("never-linked");

    expect(result.removed).toBe(false);
  });

  it("withdraws an identifier from this person", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-a",
      origin: "minted",
      alsoMe: ["machine-2"],
    });

    const result = await useCase(store).unlink("machine-2");

    expect(result.removed).toBe(true);
    expect((await store.read())?.alsoMe).toEqual([]);
  });

  it("reports nothing to remove when nobody opted in at all - off already took the alsoMe list with it", async () => {
    const result = await useCase(new InMemoryPersonIdentityStore(null)).unlink("machine-2");

    expect(result.removed).toBe(false);
  });
});

describe("PersonIdentityUseCase.name", () => {
  it("refuses when nothing was opted into, naming on as the missing step", async () => {
    const useCaseInstance = useCase(new InMemoryPersonIdentityStore(null));

    await expect(useCaseInstance.name("Baptiste")).rejects.toThrow(IdentityNotOptedInError);
  });

  it("refuses an empty or whitespace-only value", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
    });

    await expect(useCase(store).name("   ")).rejects.toThrow(EmptyDisplayNameError);
  });

  it("attaches the display name beside the identifier already opted into", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
    });

    await useCase(store).name("Baptiste");

    expect(await store.read()).toEqual({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
      displayName: "Baptiste",
    });
  });
});

describe("PersonIdentityUseCase.off", () => {
  it("states that new records will carry no person, and removes the file", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
    });

    const result = await useCase(store).off();

    expect(result.removed).toBe(true);
    expect(store.forgetCount).toBe(1);
    expect(await store.read()).toBeNull();
  });

  it("does nothing when already off", async () => {
    const result = await useCase(new InMemoryPersonIdentityStore(null)).off();

    expect(result.removed).toBe(false);
    expect(result.addedIdentifiersRemoved).toBe(0);
  });

  // A file holding an empty `person_id` parses to "nobody chose" while still sitting on
  // disk. Deciding removal from that read left it there with no verb able to remove it,
  // against the contract's own "withdrawing removes the whole declaration".
  it("removes a file that exists but names nobody, rather than reading it as already off", async () => {
    const store = new InMemoryPersonIdentityStore(null);
    store.filePresent = true;

    const result = await useCase(store).off();

    expect(result.removed).toBe(true);
    expect(store.forgetCount).toBe(1);
    expect(store.filePresent).toBe(false);
  });

  it("opting in again after withdrawing mints a fresh identifier, never the old one back", async () => {
    const store = new InMemoryPersonIdentityStore(
      { personId: "withdrawn-id", origin: "minted", alsoMe: [] },
      "fresh-id"
    );
    const uc = useCase(store);

    await uc.off();
    const result = await uc.on();

    expect(result.minted).toBe(true);
    expect(result.identity.personId).toBe("fresh-id");
    expect(result.identity.personId).not.toBe("withdrawn-id");
  });

  it("discards a damaged identity file rather than leaving a person unable to withdraw", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
    });
    store.throwOnRead = new UnreadableIdentityFileError(store.filePath, "EISDIR");

    const result = await useCase(store).off();

    expect(result.removed).toBe(true);
    expect(result.discardedDamaged).toBe(true);
    expect(store.forgetCount).toBe(1);
  });

  it("still throws off's own way for anything that is not the store's own unreadable error", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
    });
    store.throwOnRead = new Error("some other failure entirely");

    await expect(useCase(store).off()).rejects.toThrow("some other failure entirely");
    expect(store.forgetCount).toBe(0);
  });

  it("removes the whole declaration, stating how many added identifiers went with it", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: ["a-second-machine", "a-third-machine"],
    });

    const result = await useCase(store).off();

    expect(result.addedIdentifiersRemoved).toBe(2);
    expect(await store.read()).toBeNull();
  });
});
