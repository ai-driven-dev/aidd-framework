import { describe, expect, it } from "vitest";
import { vscodeToolConfig } from "../../../../../src/contexts/tools/domain/profiles/vscode/profile.js";

describe("vscodeToolConfig", () => {
  describe("settings capabilities", () => {
    const settings = Array.isArray(vscodeToolConfig.settings)
      ? vscodeToolConfig.settings
      : [vscodeToolConfig.settings];

    it("maps vscodeExtensions to .vscode/extensions.json", () => {
      const cap = settings.find((s) => s.consumes.includes("vscodeExtensions"));
      expect(cap?.buildOutputPath()).toBe(".vscode/extensions.json");
    });

    it("maps vscodeKeybindings to .vscode/keybindings.json", () => {
      const cap = settings.find((s) => s.consumes.includes("vscodeKeybindings"));
      expect(cap?.buildOutputPath()).toBe(".vscode/keybindings.json");
    });

    it("maps vscodeSettings to .vscode/settings.json", () => {
      const cap = settings.find((s) => s.consumes.includes("vscodeSettings"));
      expect(cap?.buildOutputPath()).toBe(".vscode/settings.json");
    });

    it("returns undefined for unknown config names", () => {
      const cap = settings.find((s) => s.consumes.includes("unknown"));
      expect(cap).toBeUndefined();
    });

    it("keybindings.json uses none strategy — array format cannot be key-merged", () => {
      const cap = settings.find((s) => s.consumes.includes("vscodeKeybindings"));
      expect(cap?.getMergeStrategy()).toBe("none");
    });

    it("settings.json and extensions.json preserve user customizations", () => {
      const mergeable = settings.filter((s) => !s.consumes.includes("vscodeKeybindings"));
      for (const cap of mergeable) {
        expect(cap.getMergeStrategy()).toBe("user-prime");
      }
    });
  });
});
