import { describe, expect, it } from "vitest";
import {
  buildHostRegistration,
  type TelemetryHostRegistrationEvidence,
} from "../../../src/domain/models/telemetry-setup.js";

const REGISTRY = "/home/dev/.claude/plugins/installed_plugins.json";

function evidence(
  overrides: Partial<TelemetryHostRegistrationEvidence> = {}
): TelemetryHostRegistrationEvidence {
  return {
    tool: "claude",
    plugins: [{ name: "aidd-telemetry", marketplace: "aidd-framework" }],
    reading: { location: REGISTRY, refs: new Map([["aidd-telemetry@aidd-framework", true]]) },
    ...overrides,
  };
}

function only(input: TelemetryHostRegistrationEvidence) {
  const entry = buildHostRegistration([input]).entries[0];
  if (entry === undefined) throw new Error("expected exactly one entry");
  return entry;
}

describe("what a host's own registry says about a plugin AIDD installed", () => {
  it("is registered when the registry carries its ref", () => {
    expect(only(evidence()).answer).toBe("registered");
  });

  // The #703 failure itself: the declaration is perfectly good and the host drops it,
  // because the host consults its registry and nothing else.
  it("is not registered when the registry was read and lacks the ref", () => {
    const entry = only(evidence({ reading: { location: REGISTRY, refs: new Map() } }));

    expect(entry.answer).toBe("not-registered");
    expect(entry.detail).toContain(REGISTRY);
    expect(entry.detail).toContain("orphaned");
  });

  // Folding this into `registered` would report a plugin that will not load as one that
  // will, which is the whole defect being fixed, one layer down.
  it("tells a disabled registration from an absent one", () => {
    const reading = {
      location: REGISTRY,
      refs: new Map([["aidd-telemetry@aidd-framework", false]]),
    };

    expect(only(evidence({ reading })).answer).toBe("registered-disabled");
  });

  it("is unanswerable when the registry could not be read, never `not-registered`", () => {
    const reading = { location: REGISTRY, unreadable: "ENOENT" };
    const entry = only(evidence({ reading }));

    expect(entry.answer).toBe("unanswerable");
    expect(entry.detail).toContain("ENOENT");
  });

  it("is unanswerable for a host nothing here knows how to ask", () => {
    expect(only(evidence({ reading: undefined })).answer).toBe("unanswerable");
  });

  // Every measured host keys its registry on `<plugin>@<marketplace>`, so a plugin with no
  // marketplace recorded cannot be looked up anywhere — unanswerable at the source, not a
  // lookup that came back empty.
  it("is unanswerable when no ref can be built at all, and names no ref", () => {
    const entry = only(evidence({ plugins: [{ name: "hand-copied" }] }));

    expect(entry.answer).toBe("unanswerable");
    expect(entry.ref).toBeUndefined();
  });

  it("gives every plugin its own entry, across tools", () => {
    const result = buildHostRegistration([
      evidence(),
      evidence({ plugins: [{ name: "aidd-dev", marketplace: "aidd-framework" }] }),
    ]);

    expect(result.entries.map((e) => e.plugin)).toEqual(["aidd-telemetry", "aidd-dev"]);
  });

  it("reports no entry for a project with nothing installed", () => {
    expect(buildHostRegistration([])).toEqual({ entries: [] });
  });
});
