import { describe, expect, it } from "vitest";
import {
  EmptyDisplayNameError,
  IdentityNotOptedInError,
} from "../../../../src/application/errors.js";
import { PersonIdentityUseCase } from "../../../../src/application/use-cases/telemetry/person-identity-use-case.js";
import { UnreadableIdentityFileError } from "../../../../src/domain/errors.js";
import { InMemoryPersonIdentityStore } from "../../../helpers/ports/in-memory-person-identity-store.js";

describe("PersonIdentityUseCase.status", () => {
  it("answers no identity when nobody opted in", async () => {
    const useCase = new PersonIdentityUseCase(new InMemoryPersonIdentityStore(null));

    const result = await useCase.status();

    expect(result.identity).toBeNull();
  });

  it("answers an identity with no name", async () => {
    const store = new InMemoryPersonIdentityStore({ personId: "person-1" });

    const result = await new PersonIdentityUseCase(store).status();

    expect(result.identity).toEqual({ personId: "person-1" });
  });

  it("answers an identity with a name", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      displayName: "Baptiste",
    });

    const result = await new PersonIdentityUseCase(store).status();

    expect(result.identity).toEqual({ personId: "person-1", displayName: "Baptiste" });
  });

  it("throws, never answers 'no identity', when the store cannot be read", async () => {
    const store = new InMemoryPersonIdentityStore(null);
    store.throwOnRead = new Error("identity.json is a directory");

    await expect(new PersonIdentityUseCase(store).status()).rejects.toThrow(
      "identity.json is a directory"
    );
  });
});

describe("PersonIdentityUseCase.on", () => {
  it("mints an identifier when none exists", async () => {
    const store = new InMemoryPersonIdentityStore(null, "fresh-id");

    const result = await new PersonIdentityUseCase(store).on();

    expect(result.minted).toBe(true);
    expect(result.identity).toEqual({ personId: "fresh-id" });
    expect(store.mintCount).toBe(1);
  });

  it("a second on reports the same identifier, never a new one", async () => {
    const store = new InMemoryPersonIdentityStore({ personId: "existing-id" }, "fresh-id");

    const result = await new PersonIdentityUseCase(store).on();

    expect(result.minted).toBe(false);
    expect(result.identity).toEqual({ personId: "existing-id" });
    expect(store.mintCount).toBe(0);
  });
});

describe("PersonIdentityUseCase.name", () => {
  it("refuses when nothing was opted into, naming on as the missing step", async () => {
    const useCase = new PersonIdentityUseCase(new InMemoryPersonIdentityStore(null));

    await expect(useCase.name("Baptiste")).rejects.toThrow(IdentityNotOptedInError);
  });

  it("refuses an empty or whitespace-only value", async () => {
    const store = new InMemoryPersonIdentityStore({ personId: "person-1" });

    await expect(new PersonIdentityUseCase(store).name("   ")).rejects.toThrow(
      EmptyDisplayNameError
    );
  });

  it("attaches the display name beside the identifier already opted into", async () => {
    const store = new InMemoryPersonIdentityStore({ personId: "person-1" });

    await new PersonIdentityUseCase(store).name("Baptiste");

    expect(await store.read()).toEqual({ personId: "person-1", displayName: "Baptiste" });
  });
});

describe("PersonIdentityUseCase.off", () => {
  it("states that new records will carry no person, and removes the file", async () => {
    const store = new InMemoryPersonIdentityStore({ personId: "person-1" });

    const result = await new PersonIdentityUseCase(store).off();

    expect(result.removed).toBe(true);
    expect(store.forgetCount).toBe(1);
    expect(await store.read()).toBeNull();
  });

  it("does nothing when already off", async () => {
    const store = new InMemoryPersonIdentityStore(null);

    const result = await new PersonIdentityUseCase(store).off();

    expect(result.removed).toBe(false);
    expect(store.forgetCount).toBe(0);
  });

  it("opting in again after withdrawing mints a fresh identifier, never the old one back", async () => {
    const store = new InMemoryPersonIdentityStore({ personId: "withdrawn-id" }, "fresh-id");
    const useCase = new PersonIdentityUseCase(store);

    await useCase.off();
    const result = await useCase.on();

    expect(result.minted).toBe(true);
    expect(result.identity.personId).toBe("fresh-id");
    expect(result.identity.personId).not.toBe("withdrawn-id");
  });

  it("discards a damaged identity file rather than leaving a person unable to withdraw", async () => {
    const store = new InMemoryPersonIdentityStore({ personId: "person-1" });
    store.throwOnRead = new UnreadableIdentityFileError(store.filePath, "EISDIR");

    const result = await new PersonIdentityUseCase(store).off();

    expect(result.removed).toBe(true);
    expect(result.discardedDamaged).toBe(true);
    expect(store.forgetCount).toBe(1);
  });

  it("still throws status's own way for anything that is not the store's own unreadable error", async () => {
    const store = new InMemoryPersonIdentityStore({ personId: "person-1" });
    store.throwOnRead = new Error("some other failure entirely");

    await expect(new PersonIdentityUseCase(store).off()).rejects.toThrow(
      "some other failure entirely"
    );
    expect(store.forgetCount).toBe(0);
  });
});
