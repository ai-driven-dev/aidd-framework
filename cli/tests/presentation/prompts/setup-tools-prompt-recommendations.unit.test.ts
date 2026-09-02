import { describe, expect, it } from "vitest";
import { ProjectContext } from "../../../src/contexts/framework/domain/project-context.js";
import {
  recommendAiTools,
  recommendIdeTools,
} from "../../../src/contexts/framework/domain/tool-recommendations.js";

function ctx(over: Partial<ConstructorParameters<typeof ProjectContext>[0]> = {}) {
  return new ProjectContext({
    stack: over.stack ?? "unknown",
    isMonorepo: over.isMonorepo ?? false,
    hasFramework: over.hasFramework ?? false,
  });
}

describe("setup-tools-prompt smart recommendations", () => {
  describe("recommendAiTools", () => {
    it("defaults to claude when no context", () => {
      expect(recommendAiTools(undefined)).toEqual(["claude"]);
    });

    it("returns nothing when framework already installed", () => {
      expect(recommendAiTools(ctx({ hasFramework: true }))).toEqual([]);
    });

    it("recommends claude + copilot for typescript", () => {
      expect(recommendAiTools(ctx({ stack: "typescript" }))).toEqual(["claude", "copilot"]);
    });

    it("recommends claude + copilot for monorepo", () => {
      expect(recommendAiTools(ctx({ isMonorepo: true }))).toEqual(["claude", "copilot"]);
    });

    it("recommends claude + codex for python", () => {
      expect(recommendAiTools(ctx({ stack: "python" }))).toEqual(["claude", "codex"]);
    });
  });

  describe("recommendIdeTools", () => {
    it("returns nothing without context", () => {
      expect(recommendIdeTools(undefined)).toEqual([]);
    });

    it("recommends vscode for typescript", () => {
      expect(recommendIdeTools(ctx({ stack: "typescript" }))).toEqual(["vscode"]);
    });

    it("recommends vscode for monorepo", () => {
      expect(recommendIdeTools(ctx({ isMonorepo: true }))).toEqual(["vscode"]);
    });

    it("returns nothing for python (no node tools)", () => {
      expect(recommendIdeTools(ctx({ stack: "python" }))).toEqual([]);
    });

    it("returns nothing when framework already installed", () => {
      expect(recommendIdeTools(ctx({ hasFramework: true }))).toEqual([]);
    });
  });
});
