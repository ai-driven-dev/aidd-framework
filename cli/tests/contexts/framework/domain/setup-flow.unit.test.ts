import { describe, expect, it } from "vitest";
import { SetupFlow } from "../../../../src/contexts/framework/domain/setup-flow.js";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import "../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import {
  InvalidPluginModeConfigError,
  InvalidSetupToolIdError,
  UserScopeIdeToolsError,
  UserScopeNoToolsError,
  UserScopePluginModeError,
  UserScopeUnsupportedAiToolsError,
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

  describe("scope", () => {
    it("defaults to project", () => {
      expect(makeFlow().scope).toBe("project");
    });

    it("carries user through when asked", () => {
      expect(makeFlow({ scope: "user", aiTools: ["claude"] }).scope).toBe("user");
    });

    it("refuses an IDE tool at user scope — an IDE tool has no user scope to install at", () => {
      expect(() => makeFlow({ scope: "user", ideTools: ["vscode"] })).toThrow(
        UserScopeIdeToolsError
      );
    });

    it("accepts an IDE tool at project scope, unaffected", () => {
      expect(() => makeFlow({ scope: "project", ideTools: ["vscode"] })).not.toThrow();
    });

    it("refuses --scope user with no --ai — nothing would be registered for any tool", () => {
      expect(() => makeFlow({ scope: "user", aiTools: [] })).toThrow(UserScopeNoToolsError);
    });

    it("refuses an AI tool with no user-scope activation at --scope user (opencode)", () => {
      expect(() => makeFlow({ scope: "user", aiTools: ["opencode"] })).toThrow(
        UserScopeUnsupportedAiToolsError
      );
    });

    it("accepts an AI tool that installs to a user-scope directory at --scope user (cursor)", () => {
      expect(() => makeFlow({ scope: "user", aiTools: ["cursor"] })).not.toThrow();
    });

    it("accepts a tool driving native activation at --scope user (claude)", () => {
      expect(() => makeFlow({ scope: "user", aiTools: ["claude"] })).not.toThrow();
    });

    it("refuses --plugins at --scope user — no manifest entry exists yet to enable one against", () => {
      expect(() => makeFlow({ scope: "user", aiTools: ["claude"], pluginMode: "all" })).toThrow(
        UserScopePluginModeError
      );
    });
  });
});
