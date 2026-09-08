import { describe, expect, it } from "vitest";
import {
  describeFullRemovalInstruction,
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

  // Lot 9, item D2: the plugin stays because those other projects still need it, and
  // full removal names both commands, in order — `aidd clean` in each of them before
  // `aidd clean --scope user` — the same shared clause `clean --scope user`'s own
  // no-registration report states.
  it("names the projects and both removal commands, in order, sharing the same clause clean --scope user uses", () => {
    const message = describeGuardedPluginRefMessage({
      binary: "codex",
      ref: "aidd-vcs@aidd-framework",
      otherProjects: ["/other-project"],
    });
    expect(message).toContain("/other-project");
    expect(message).toContain(describeFullRemovalInstruction());
    expect(message.indexOf("`aidd clean`")).toBeGreaterThanOrEqual(0);
    expect(message.indexOf("`aidd clean`")).toBeLessThan(
      message.indexOf("`aidd clean --scope user`")
    );
  });

  // Lot 9 review, D2-N1: "still reference the shared source" and "still need it" stated
  // the same fact twice in one sentence. The rewritten clause states the fact once, then
  // gives the causal reason it stays, rather than restating it.
  it("states the fact once, not twice ('still reference' the source, not also 'still need it')", () => {
    const message = describeGuardedPluginRefMessage({
      binary: "codex",
      ref: "aidd-vcs@aidd-framework",
      otherProjects: ["/other-project"],
    });
    expect(message).toContain("still references the shared source");
    expect(message).not.toContain("need it");
  });
});

describe("describeFullRemovalInstruction", () => {
  it("names both commands, aidd clean before aidd clean --scope user", () => {
    const instruction = describeFullRemovalInstruction();
    expect(instruction).toContain("`aidd clean`");
    expect(instruction).toContain("`aidd clean --scope user`");
    expect(instruction.indexOf("`aidd clean`")).toBeLessThan(
      instruction.indexOf("`aidd clean --scope user`")
    );
  });
});
