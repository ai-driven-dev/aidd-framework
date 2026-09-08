import { describe, expect, it } from "vitest";
import {
  describeGuardedPluginRefMessage,
  refAnotherProjectStillNeeds,
} from "../../../../../src/contexts/framework/application/shared/shared-source-reference-support.js";

const BASE = {
  ref: "aidd-dev@aidd-framework",
  sharedSourceHostName: "aidd-framework",
  enablementIsMachineGlobal: true,
  otherProjects: ["/other-project"],
} as const;

describe("refAnotherProjectStillNeeds", () => {
  it("is true when the ref came from the shared source, enablement is machine-global, and another project still references it", () => {
    expect(refAnotherProjectStillNeeds(BASE)).toBe(true);
  });

  it("is false when no other project references the shared source", () => {
    expect(refAnotherProjectStillNeeds({ ...BASE, otherProjects: [] })).toBe(false);
  });

  it("is false when this host's own enablement is not machine-global (claude)", () => {
    expect(refAnotherProjectStillNeeds({ ...BASE, enablementIsMachineGlobal: false })).toBe(false);
  });

  it("is false when the ref does not come from the shared source's own hostName", () => {
    expect(
      refAnotherProjectStillNeeds({ ...BASE, ref: "some-plugin@a-different-marketplace" })
    ).toBe(false);
  });

  it("is false when this run never resolved the shared source's own hostName for this tool", () => {
    expect(refAnotherProjectStillNeeds({ ...BASE, sharedSourceHostName: undefined })).toBe(false);
  });
});

// S3 (lot 8 review): the extracted message builder must keep singular/plural correct —
// nothing else in the suite pins this sentence's grammar, so a swapped branch
// ("references"/"reference", "project"/"projects") would pass every other test.
describe("describeGuardedPluginRefMessage", () => {
  it("uses singular wording for exactly one other project", () => {
    const message = describeGuardedPluginRefMessage({
      binary: "codex",
      ref: "aidd-vcs@aidd-framework",
      otherProjects: ["/other-project"],
    });
    expect(message).toContain("1 other project still references");
  });

  it("uses plural wording for more than one other project", () => {
    const message = describeGuardedPluginRefMessage({
      binary: "codex",
      ref: "aidd-vcs@aidd-framework",
      otherProjects: ["/other-project", "/third-project"],
    });
    expect(message).toContain("2 other projects still reference");
  });
});
