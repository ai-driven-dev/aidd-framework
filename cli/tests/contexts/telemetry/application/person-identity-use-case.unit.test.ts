import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PersonIdentityUseCase } from "../../../../src/contexts/telemetry/application/person-identity-use-case.js";
import {
  EmptyDisplayNameError,
  EmptyIdentifierError,
  IdentityRequiredToLinkError,
  UnreadableIdentityFileError,
} from "../../../../src/kernel/errors.js";
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
});

describe("PersonIdentityUseCase.use, settling which identifier stands", () => {
  it("mints an identifier when none exists", async () => {
    const store = new InMemoryPersonIdentityStore(null, "fresh-id");

    const result = await useCase(store).use({});

    expect(result.outcome).toBe("minted");
    expect(result.identity).toEqual({ personId: "fresh-id", origin: "minted", alsoMe: [] });
    expect(store.mintCount).toBe(1);
  });

  it("a second on reports the same identifier, never a new one", async () => {
    const store = new InMemoryPersonIdentityStore(
      { personId: "existing-id", origin: "minted", alsoMe: [] },
      "fresh-id"
    );

    const result = await useCase(store).use({});

    expect(result.outcome).toBe("unchanged");
    expect(result.identity).toEqual({ personId: "existing-id", origin: "minted", alsoMe: [] });
    expect(store.mintCount).toBe(0);
  });
});

describe("PersonIdentityUseCase.use", () => {
  it("refuses an empty or whitespace-only identifier, writing nothing", async () => {
    const store = new InMemoryPersonIdentityStore(null);

    await expect(useCase(store).use({ identifier: "   " })).rejects.toThrow(EmptyIdentifierError);
    expect(await store.read()).toBeNull();
  });

  it("takes an identifier minted elsewhere, recording it as adopted", async () => {
    const store = new InMemoryPersonIdentityStore(null);

    const result = await useCase(store).use({ identifier: "machine-1-id" });

    expect(result.outcome).not.toBe("unchanged");
    expect(result.identity).toEqual({ personId: "machine-1-id", origin: "adopted", alsoMe: [] });
    expect(result.replacedPersonId).toBeUndefined();
  });

  it("reports the identifier already in effect, and writes nothing", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "machine-1-id",
      origin: "minted",
      alsoMe: [],
    });

    const result = await useCase(store).use({ identifier: "machine-1-id" });

    expect(result.outcome).toBe("unchanged");
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

    const result = await useCase(store).use({ identifier: "new-id" });

    expect(result.outcome).not.toBe("unchanged");
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

    const result = await useCase(store).use({ identifier: "new-id" });

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
    await expect(uc.link("some-other-machine-id")).rejects.toThrow(/telemetry identity use/u);
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

describe("PersonIdentityUseCase.use, minted apart from adopted", () => {
  /**
   * The one distinction the merge had to carry across.
   *
   * `on` and `use` were two commands, so nothing could confuse them. Behind one door the
   * difference lives entirely in a word, and the word decides what a person is told: an
   * identifier this machine created gets the disclosure about what it will attach to, while
   * one carried here from another machine has to say what it replaced instead. Reporting
   * either as the other is a sentence about the wrong event.
   */
  it("calls a fresh identifier minted, and one carried here adopted", async () => {
    const minted = await useCase(new InMemoryPersonIdentityStore(null)).use({});
    const adopted = await useCase(new InMemoryPersonIdentityStore(null)).use({
      identifier: "from-another-machine",
    });

    expect(minted.outcome).toBe("minted");
    expect(adopted.outcome).toBe("adopted");
    // And on disk, where a later reader looks: the same distinction, independently.
    expect(minted.identity.origin).toBe("minted");
    expect(adopted.identity.origin).toBe("adopted");
  });

  it("calls replacing one identifier with another adopted, never minted", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
    });

    const result = await useCase(store).use({ identifier: "person-2" });

    expect(result.outcome).toBe("adopted");
    expect(result.replacedPersonId).toBe("person-1");
  });
});

describe("PersonIdentityUseCase.use, attaching a display name", () => {
  it("mints an identifier for a name given when none stands, rather than refusing", async () => {
    // The separate `name` verb refused here, and had to: it could only decorate something
    // that already existed. Under one door the refusal has no reason left — `use` is the
    // verb that opts in, and `--name` is a property of what it settles on. A person typing
    // `identity use --name Ada` with nothing standing is saying who they are, not asking to
    // rename a thing that is not there.
    const store = new InMemoryPersonIdentityStore(null);

    const result = await useCase(store).use({ displayName: "Ada" });

    expect(result.outcome).toBe("minted");
    expect(result.displayNameSet).toBe("Ada");
    expect(result.identity.origin).toBe("minted");
  });

  it("refuses an empty or whitespace-only value", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
    });

    await expect(useCase(store).use({ displayName: "   " })).rejects.toThrow(EmptyDisplayNameError);
  });

  it("attaches the display name beside the identifier already opted into", async () => {
    const store = new InMemoryPersonIdentityStore({
      personId: "person-1",
      origin: "minted",
      alsoMe: [],
    });

    await useCase(store).use({ displayName: "Baptiste" });

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
    const result = await uc.use({});

    expect(result.outcome).toBe("minted");
    expect(result.identity.personId).toBe("fresh-id");
    expect(result.identity.personId).not.toBe("withdrawn-id");
  });

  // The store reads back nothing, because the file is a directory - a shape that cannot
  // also parse to an identity. Seeding one here would let `removed` come from the identity
  // instead of from the file, which is exactly the confusion `forget()` answering from the
  // filesystem exists to end.
  it("discards a damaged identity file rather than leaving a person unable to withdraw", async () => {
    const store = new InMemoryPersonIdentityStore(null);
    store.filePresent = true;
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

/**
 * Every command an error names is a command the CLI still has.
 *
 * An error message is the one surface that tells a person what to run next, and it is the
 * one nothing typechecks. Reducing `identity` from seven verbs to four left
 * `EmptyDisplayNameError` saying "run `aidd telemetry identity name`" — a verb the same
 * change had just deleted, reachable from an ordinary typo, and invisible to every gate
 * because the only test asserted the error's *class* and never its sentence.
 *
 * So this reads the sentences instead. It is deliberately a scan of the source rather than
 * a list of expected strings: a list would have to be updated by the same hand that forgets
 * to update the message, which is how the first one went stale.
 */
describe("what the errors tell a person to run", () => {
  /** The verbs `registerTelemetryIdentityCommand` actually registers, plus the bare noun. */
  const IDENTITY_VERBS = new Set(["", "use", "off", "link", "unlink"]);

  it("names no identity verb the command surface does not have", () => {
    const source = readFileSync(
      new URL("../../../../src/kernel/errors.ts", import.meta.url),
      "utf8"
    );
    const named = [...source.matchAll(/aidd telemetry identity ?([a-z-]*)/gu)].map(
      (match) => match[1] ?? ""
    );

    // Non-empty: a scan that found nothing would pass forever while saying nothing.
    expect(named.length).toBeGreaterThan(0);
    for (const verb of named) {
      expect(IDENTITY_VERBS, `errors.ts names \`identity ${verb}\``).toContain(verb);
    }
  });
});
