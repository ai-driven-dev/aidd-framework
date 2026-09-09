import { describe, expect, it } from "vitest";
import { extractConfigCapabilities } from "../../../../src/contexts/framework/domain/config-capability.js";
import { HooksCapability } from "../../../../src/contexts/tools/domain/capabilities/hooks-capability.js";
import { McpCapability } from "../../../../src/contexts/tools/domain/capabilities/mcp-capability.js";
import { SettingsCapability } from "../../../../src/contexts/tools/domain/capabilities/settings-capability.js";
import type {
  HasSettings,
  IdeToolConfig,
} from "../../../../src/contexts/tools/domain/contracts.js";
import { stubAiTool } from "../../../helpers/ports/stub-ai-tool.js";

const mcp = new McpCapability({ outputPath: ".mcp.json", format: "json" });
const hooks = new HooksCapability({ outputPath: ".claude/settings.json" });
const settings = new SettingsCapability({
  outputPath: ".claude/settings.json",
  mergeStrategy: "none",
});
const extensions = new SettingsCapability({
  outputPath: ".vscode/extensions.json",
  mergeStrategy: "user-prime",
});

function ideTool(declared: SettingsCapability | SettingsCapability[]): IdeToolConfig & HasSettings {
  return {
    kind: "ide",
    toolId: "vscode",
    directory: ".vscode/",
    signalDir: null,
    settings: declared,
  };
}

describe("extractConfigCapabilities — the config files a tool declares", () => {
  describe("an IDE tool", () => {
    it("lists each settings file of a tool declaring several", () => {
      expect(extractConfigCapabilities(ideTool([extensions, settings]))).toStrictEqual([
        extensions,
        settings,
      ]);
    });

    it("lists the one settings file of a tool declaring a single one", () => {
      expect(extractConfigCapabilities(ideTool(settings))).toStrictEqual([settings]);
    });
  });

  describe("an AI tool", () => {
    it("lists mcp, hooks and settings in that order", () => {
      const tool = stubAiTool("claude", { mcp, hooks, settings });

      expect(extractConfigCapabilities(tool)).toStrictEqual([mcp, hooks, settings]);
    });

    it("lists each settings file of a tool declaring several", () => {
      const tool = stubAiTool("claude", { settings: [extensions, settings] });

      expect(extractConfigCapabilities(tool)).toStrictEqual([extensions, settings]);
    });

    it("lists nothing for a tool declaring no config capability", () => {
      expect(extractConfigCapabilities(stubAiTool("claude", { rules: {} }))).toStrictEqual([]);
    });

    it("lists nothing for a tool whose capabilities are absent altogether", () => {
      expect(extractConfigCapabilities(stubAiTool("claude", null))).toStrictEqual([]);
    });
  });
});
