import { describe, expect, it } from "vitest";
import { SetupFlow } from "../../../../src/contexts/framework/domain/setup-flow.js";
import {
  InvalidPluginModeConfigError,
  InvalidSetupToolIdError,
} from "../../../../src/kernel/errors.js";

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
});
