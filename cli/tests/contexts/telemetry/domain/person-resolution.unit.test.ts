import { describe, expect, it } from "vitest";
import {
  resolvePerson,
  withAlsoMeAdded,
  withPersonIdAdopted,
} from "../../../../src/contexts/telemetry/domain/person-resolution.js";
import type { PersonIdentity } from "../../../../src/contexts/telemetry/domain/ports/person-identity-reader.js";

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

  // `person_id` is stamped when a record is stored, so whether a record carries one depends on
  // when the identity was declared. Every sink line is `local-read`, by this machine's reader.
  it("names an unstamped record after this machine's own declared identity", () => {
    const resolved = resolvePerson(identityWithAlsoMe(), undefined);

    expect(resolved.resolution).toBe("this-machine");
    expect(resolved.personId).toBe("person-a");
    expect(resolved.displayName).toBe("Ada");
  });

  // Same evidence a mapped row carries, for the same reason: a person line must be
  // traceable back to what produced it without a second lookup.
  it("carries this identity's own identifiers as the evidence behind that row", () => {
    const resolved = resolvePerson(identityWithAlsoMe(), undefined);

    expect(resolved.identities).toEqual(["person-a", "claude-machine-1", "codex-machine-2"]);
  });

  it("resolves nothing at all as none when no identity was ever declared", () => {
    const resolved = resolvePerson(null, undefined);

    expect(resolved.resolution).toBe("none");
    expect(resolved.identities).toEqual([]);
  });

  // The fallback must never overrule what a record actually said. An identifier this
  // identity does not claim stays unresolved, and one it does claim stays mapped.
  it("never lets the fallback overrule an identifier the record carried", () => {
    const unresolved = resolvePerson(identityWithAlsoMe(), "nobody-claimed-this");
    const mapped = resolvePerson(identityWithAlsoMe(), "claude-machine-1");

    expect(unresolved.resolution).toBe("unresolved");
    expect(mapped.resolution).toBe("mapped");
  });

  it("distinguishes none, this-machine and unresolved from one another", () => {
    const none = resolvePerson(null, undefined);
    const thisMachine = resolvePerson(identityWithAlsoMe(), undefined);
    const unresolved = resolvePerson(identityWithAlsoMe(), "nobody-claimed-this");

    expect(new Set([none.resolution, thisMachine.resolution, unresolved.resolution]).size).toBe(3);
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

  // The proof belongs to the compiler: `PersonIdentity` has no field for a second person's
  // claim, and the day a roster field returns the directive below has nothing to suppress.
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

  // Add an identifier, then adopt it: before the invariant moved into the writers, `also_me`
  // kept the newly canonical identifier and one row named it twice as its own evidence.
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
