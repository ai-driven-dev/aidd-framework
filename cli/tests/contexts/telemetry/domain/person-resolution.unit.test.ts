import { describe, expect, it } from "vitest";
import {
  resolvePerson,
  withAlsoMeAdded,
  withPersonIdAdopted,
} from "../../../../src/contexts/telemetry/domain/person-resolution.js";
import type { PersonIdentity } from "../../../../src/contexts/telemetry/domain/ports/person-identity-reader.js";

/**
 * One machine's own identity, carrying a display name and two identifiers it did not
 * choose here — the Test Scope's own setup, reused across every case below rather than
 * rebuilt per test.
 */
function identityWithAlsoMe(): PersonIdentity {
  return {
    personId: "person-a",
    origin: "adopted",
    alsoMe: ["claude-machine-1", "codex-machine-2"],
    displayName: "Ada",
  };
}

describe("resolvePerson", () => {
  it("resolves an identity listed under alsoMe to this person's canonical identifier", () => {
    const resolved = resolvePerson(identityWithAlsoMe(), "claude-machine-1");

    expect(resolved.resolution).toBe("mapped");
    expect(resolved.personId).toBe("person-a");
    expect(resolved.displayName).toBe("Ada");
  });

  it("resolves this person's own canonical identifier to that same person", () => {
    const resolved = resolvePerson(identityWithAlsoMe(), "person-a");

    expect(resolved.resolution).toBe("mapped");
    expect(resolved.personId).toBe("person-a");
  });

  it("resolves an identifier nobody added as unresolved", () => {
    const resolved = resolvePerson(identityWithAlsoMe(), "nobody-claimed-this");

    expect(resolved.resolution).toBe("unresolved");
    expect(resolved.personId).toBeUndefined();
    expect(resolved.identities).toEqual(["nobody-claimed-this"]);
  });

  it("resolves nothing at all as none, not unresolved", () => {
    const resolved = resolvePerson(identityWithAlsoMe(), undefined);

    expect(resolved.resolution).toBe("none");
    expect(resolved.identities).toEqual([]);
  });

  it("distinguishes none from unresolved", () => {
    const none = resolvePerson(identityWithAlsoMe(), undefined);
    const unresolved = resolvePerson(identityWithAlsoMe(), "nobody-claimed-this");

    expect(none.resolution).not.toBe(unresolved.resolution);
  });

  it("two identifiers nobody added stay distinct, never merged into one bucket", () => {
    const first = resolvePerson(identityWithAlsoMe(), "unplaced-one");
    const second = resolvePerson(identityWithAlsoMe(), "unplaced-two");

    expect(first.resolution).toBe("unresolved");
    expect(second.resolution).toBe("unresolved");
    expect(first.identities).toEqual(["unplaced-one"]);
    expect(second.identities).toEqual(["unplaced-two"]);
    expect(first.identities).not.toEqual(second.identities);
  });

  it("a null identity resolves any given identifier as unresolved, still naming it", () => {
    const resolved = resolvePerson(null, "claude-machine-1");

    expect(resolved.resolution).toBe("unresolved");
    expect(resolved.identities).toEqual(["claude-machine-1"]);
  });

  it("a null identity still resolves an absent identifier as none", () => {
    expect(resolvePerson(null, undefined).resolution).toBe("none");
  });

  it("a resolved person carries back every identity behind it, including its canonical one", () => {
    const resolved = resolvePerson(identityWithAlsoMe(), "codex-machine-2");

    expect(resolved.identities).toEqual(
      expect.arrayContaining(["person-a", "claude-machine-1", "codex-machine-2"])
    );
    expect(resolved.identities).toContain(resolved.personId);
  });

  it("carries no display name back rather than an empty one when none was set", () => {
    const noDisplayName: PersonIdentity = {
      personId: "person-a",
      origin: "minted",
      alsoMe: ["claude-machine-1"],
    };

    const resolved = resolvePerson(noDisplayName, "claude-machine-1");

    expect(resolved.resolution).toBe("mapped");
    expect(resolved).not.toHaveProperty("displayName");
  });

  it("a display name is carried back untouched, never derived", () => {
    const resolved = resolvePerson(identityWithAlsoMe(), "claude-machine-1");

    expect(resolved.displayName).toBe("Ada");
  });

  it("an identity can be built with no display name and no added identifiers, reading back with neither invented", () => {
    const bare: PersonIdentity = { personId: "person-a", origin: "minted", alsoMe: [] };

    expect(bare).not.toHaveProperty("displayName");
    expect(bare.alsoMe).toEqual([]);
  });

  // A second person is not a value this shape can carry — the proof belongs to the
  // compiler rather than to a run: `PersonIdentity` has no field for a second, distinct
  // person's claim, so the attempt below does not compile. `@ts-expect-error` inverts
  // that into an assertion: the day a roster field is added back, the directive has
  // nothing to suppress and `tsc` fails on it. There is nothing here for a runtime check
  // to guard, because there is no shape in which the failure could be constructed.
  it("admits no second person's claim, at compile time", () => {
    const identity: PersonIdentity = {
      personId: "person-a",
      origin: "adopted",
      alsoMe: [],
      // @ts-expect-error PersonIdentity carries one person, never a roster of entries
      entries: [{ personId: "person-b", identities: ["person-b"] }],
    };

    expect(identity).toBeDefined();
  });

  // The sequence three supported verbs allow: add an identifier, later adopt it as your
  // own. Before the invariant moved into the writers, `also_me` kept the newly canonical
  // identifier and one row named it twice as its own evidence.
  it("adopting an identifier already added onto this person does not list it as added onto them", () => {
    const linked = withAlsoMeAdded(
      { personId: "machine-a", origin: "minted", alsoMe: [] },
      "machine-b"
    );

    const adopted = withPersonIdAdopted(linked, "machine-b");

    expect(adopted.personId).toBe("machine-b");
    expect(adopted.alsoMe).toEqual([]);
    expect(resolvePerson(adopted, "machine-b").identities).toEqual(["machine-b"]);
  });

  it("refuses to add a person's own identifier onto themselves", () => {
    const identity = { personId: "me", origin: "minted" as const, alsoMe: [] };

    expect(withAlsoMeAdded(identity, "me").alsoMe).toEqual([]);
  });

  it("adopting keeps every other added identifier, and the display name", () => {
    const current = {
      personId: "machine-a",
      origin: "minted" as const,
      alsoMe: ["machine-b", "machine-c"],
      displayName: "carried, never produced",
    };

    const adopted = withPersonIdAdopted(current, "machine-b");

    expect(adopted.alsoMe).toEqual(["machine-c"]);
    expect(adopted.displayName).toBe("carried, never produced");
    expect(adopted.origin).toBe("adopted");
  });
});
