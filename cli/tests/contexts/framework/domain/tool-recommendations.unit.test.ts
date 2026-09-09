import { describe, expect, it } from "vitest";
import { ProjectContext } from "../../../../src/contexts/framework/domain/project-context.js";
import {
  recommendAiTools,
  recommendIdeTools,
} from "../../../../src/contexts/framework/domain/tool-recommendations.js";

describe("tool recommendations for a project whose stack is not recognised", () => {
  it("recommends claude alone as the AI tool", () => {
    const context = new ProjectContext({
      stack: "unknown",
      isMonorepo: false,
      hasFramework: false,
    });

    expect(recommendAiTools(context)).toStrictEqual(["claude"]);
  });
});

describe("tool recommendations once the framework is installed", () => {
  it("recommends no IDE tool even for a typescript project", () => {
    const context = new ProjectContext({
      stack: "typescript",
      isMonorepo: false,
      hasFramework: true,
    });

    expect(recommendIdeTools(context)).toStrictEqual([]);
  });
});
