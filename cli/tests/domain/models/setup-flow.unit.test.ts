import { describe, expect, it } from "vitest";
import { SetupFlow } from "../../../src/domain/models/setup-flow.js";
import {
  InvalidPluginModeConfigError,
  InvalidSetupToolIdError,
} from "../../../src/kernel/errors.js";

const ROOT = "/project";

function makeFlow(overrides: Partial<ConstructorParameters<typeof SetupFlow>[0]> = {}): SetupFlow {
  return new SetupFlow({ projectRoot: ROOT, ...overrides });
}

describe("SetupFlow", () => {
  describe("constructor validation", () => {
    it("throws InvalidSetupToolIdError for unknown AI tool IDs", () => {
      expect(() => makeFlow({ aiTools: ["unknown-tool" as "claude"] })).toThrow(
        InvalidSetupToolIdError
      );
    });

    it("throws InvalidPluginModeConfigError when mode is 'named' with no names", () => {
      expect(() => makeFlow({ pluginMode: "named", pluginNames: [] })).toThrow(
        InvalidPluginModeConfigError
      );
    });

    it("throws InvalidPluginModeConfigError when names provided but mode is not 'named'", () => {
      expect(() => makeFlow({ pluginMode: "all", pluginNames: ["my-plugin"] })).toThrow(
        InvalidPluginModeConfigError
      );
    });

    it("constructs successfully with valid params", () => {
      const flow = makeFlow({ aiTools: ["claude"], pluginMode: "none" });
      expect(flow.projectRoot).toBe(ROOT);
      expect(flow.aiTools).toEqual(["claude"]);
    });
  });

  describe("isScriptable()", () => {
    it("returns true when not interactive", () => {
      const flow = makeFlow({ interactive: false });
      expect(flow.isScriptable()).toBe(true);
    });

    it("returns false when interactive", () => {
      const flow = makeFlow({ interactive: true });
      expect(flow.isScriptable()).toBe(false);
    });
  });

  describe("hasAnyTool()", () => {
    it("returns true when aiTools is non-empty", () => {
      const flow = makeFlow({ aiTools: ["claude"] });
      expect(flow.hasAnyTool()).toBe(true);
    });

    it("returns true when ideTools is non-empty", () => {
      const flow = makeFlow({ ideTools: ["vscode"] });
      expect(flow.hasAnyTool()).toBe(true);
    });

    it("returns false when both aiTools and ideTools are empty", () => {
      const flow = makeFlow({ aiTools: [], ideTools: [] });
      expect(flow.hasAnyTool()).toBe(false);
    });
  });

  describe("equals()", () => {
    it("returns true for two flows with the same parameters", () => {
      const a = makeFlow({ aiTools: ["claude"], interactive: false });
      const b = makeFlow({ aiTools: ["claude"], interactive: false });
      expect(a.equals(b)).toBe(true);
    });

    it("returns false when aiTools differ", () => {
      const a = makeFlow({ aiTools: ["claude"] });
      const b = makeFlow({ aiTools: ["cursor"] });
      expect(a.equals(b)).toBe(false);
    });

    it("returns false when interactive differs", () => {
      const a = makeFlow({ interactive: true });
      const b = makeFlow({ interactive: false });
      expect(a.equals(b)).toBe(false);
    });

    it("returns false when pluginMode differs", () => {
      const a = makeFlow({ pluginMode: "all" });
      const b = makeFlow({ pluginMode: "none" });
      expect(a.equals(b)).toBe(false);
    });

    it("returns false when pluginNames differ", () => {
      const a = makeFlow({ pluginMode: "named", pluginNames: ["plugin-a"] });
      const b = makeFlow({ pluginMode: "named", pluginNames: ["plugin-b"] });
      expect(a.equals(b)).toBe(false);
    });
  });
});
