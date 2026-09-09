import { describe, expect, it } from "vitest";
import { ProjectContext } from "../../../../src/contexts/framework/domain/project-context.js";

describe("ProjectContext.describe() — one line naming what was detected", () => {
  it("names every detected trait, dot-separated, in stack, monorepo, framework order", () => {
    const context = new ProjectContext({
      stack: "typescript",
      isMonorepo: true,
      hasFramework: true,
    });

    expect(context.describe()).toBe("typescript · monorepo · AIDD present");
  });

  it("names the stack alone for a single-package project without the framework", () => {
    const context = new ProjectContext({
      stack: "typescript",
      isMonorepo: false,
      hasFramework: false,
    });

    expect(context.describe()).toBe("typescript");
  });

  it("omits an unknown stack while still naming the monorepo", () => {
    const context = new ProjectContext({ stack: "unknown", isMonorepo: true, hasFramework: false });

    expect(context.describe()).toBe("monorepo");
  });

  it("names the framework beside the stack once it is installed", () => {
    const context = new ProjectContext({ stack: "python", isMonorepo: false, hasFramework: true });

    expect(context.describe()).toBe("python · AIDD present");
  });

  it("calls a project with nothing detected an unknown project", () => {
    const context = new ProjectContext({
      stack: "unknown",
      isMonorepo: false,
      hasFramework: false,
    });

    expect(context.describe()).toBe("unknown project");
  });
});
