import { describe, expect, it } from "vitest";
import { AmbiguousPersonMappingError } from "../../../src/domain/errors.js";
import {
  type PersonMapping,
  resolvePerson,
  validatePersonMapping,
} from "../../../src/domain/models/person-mapping.js";

/**
 * Two people, one carrying two identities under a display name — the Test Scope's own
 * setup, reused across every case below rather than rebuilt per test.
 */
function twoPeopleMapping(): PersonMapping {
  return {
    entries: [
      {
        personId: "person-a",
        identities: ["person-a", "claude-machine-1", "codex-machine-2"],
        displayName: "Ada",
      },
      { personId: "person-b", identities: ["person-b", "claude-machine-3"] },
    ],
  };
}

describe("resolvePerson", () => {
  it("resolves an identity listed under a person to that person's canonical identifier", () => {
    const resolved = resolvePerson(twoPeopleMapping(), "claude-machine-1");

    expect(resolved.resolution).toBe("mapped");
    expect(resolved.personId).toBe("person-a");
    expect(resolved.displayName).toBe("Ada");
  });

  it("resolves a person's own canonical identifier to that same person", () => {
    const resolved = resolvePerson(twoPeopleMapping(), "person-a");

    expect(resolved.resolution).toBe("mapped");
    expect(resolved.personId).toBe("person-a");
  });

  it("resolves an identity nobody listed as unresolved", () => {
    const resolved = resolvePerson(twoPeopleMapping(), "nobody-claimed-this");

    expect(resolved.resolution).toBe("unresolved");
    expect(resolved.personId).toBeUndefined();
    expect(resolved.identities).toEqual(["nobody-claimed-this"]);
  });

  it("resolves nothing at all as none, not unresolved", () => {
    const resolved = resolvePerson(twoPeopleMapping(), undefined);

    expect(resolved.resolution).toBe("none");
    expect(resolved.identities).toEqual([]);
  });

  it("distinguishes none from unresolved", () => {
    const none = resolvePerson(twoPeopleMapping(), undefined);
    const unresolved = resolvePerson(twoPeopleMapping(), "nobody-claimed-this");

    expect(none.resolution).not.toBe(unresolved.resolution);
  });

  it("a null mapping resolves any given identity as unresolved", () => {
    const resolved = resolvePerson(null, "claude-machine-1");

    expect(resolved.resolution).toBe("unresolved");
    expect(resolved.identities).toEqual(["claude-machine-1"]);
  });

  it("a null mapping still resolves an absent identifier as none", () => {
    expect(resolvePerson(null, undefined).resolution).toBe("none");
  });

  it("a resolved person carries back every identity behind it, including its canonical one", () => {
    const resolved = resolvePerson(twoPeopleMapping(), "codex-machine-2");

    expect(resolved.identities).toEqual(
      expect.arrayContaining(["person-a", "claude-machine-1", "codex-machine-2"])
    );
    expect(resolved.identities).toContain(resolved.personId);
  });

  it("carries no display name back rather than an empty one when none was set", () => {
    const resolved = resolvePerson(twoPeopleMapping(), "person-b");

    expect(resolved.resolution).toBe("mapped");
    expect(resolved).not.toHaveProperty("displayName");
  });

  it("a display name is carried back untouched, never derived", () => {
    const resolved = resolvePerson(twoPeopleMapping(), "claude-machine-1");

    expect(resolved.displayName).toBe("Ada");
  });
});

describe("validatePersonMapping", () => {
  it("refuses by name when two people claim one identity, never returning either", () => {
    const mapping: PersonMapping = {
      entries: [
        { personId: "person-a", identities: ["person-a", "shared-identity"] },
        { personId: "person-b", identities: ["person-b", "shared-identity"] },
      ],
    };

    let thrown: unknown;
    try {
      validatePersonMapping(mapping);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AmbiguousPersonMappingError);
    const message = (thrown as Error).message;
    expect(message).toContain("shared-identity");
    expect(message).toContain("person-a");
    expect(message).toContain("person-b");
  });

  it("an identity written twice inside one person resolves without a refusal", () => {
    const mapping: PersonMapping = {
      entries: [{ personId: "person-a", identities: ["person-a", "dup", "dup"] }],
    };

    expect(() => validatePersonMapping(mapping)).not.toThrow();
    expect(resolvePerson(mapping, "dup").personId).toBe("person-a");
  });

  it("a valid mapping with distinct claims across entries is never refused", () => {
    expect(() => validatePersonMapping(twoPeopleMapping())).not.toThrow();
  });

  it("refuses when one entry's personId collides with another entry's raw identity", () => {
    // resolvePerson matches a raw identifier against `personId` exactly like a match
    // inside `identities` (see `findEntry`), so this is exactly as ambiguous as two
    // `identities` arrays colliding and has to be caught the same way.
    const mapping: PersonMapping = {
      entries: [
        { personId: "person-a", identities: ["person-a"] },
        { personId: "person-b", identities: ["person-b", "person-a"] },
      ],
    };

    expect(() => validatePersonMapping(mapping)).toThrow(AmbiguousPersonMappingError);
  });
});
