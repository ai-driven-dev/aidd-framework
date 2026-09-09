import { describe, expect, it } from "vitest";
import { SettingsCapability } from "../../../../../src/contexts/tools/domain/capabilities/settings-capability.js";

describe("SettingsCapability", () => {
  describe("constructor", () => {
    it("accepts consumes without staticContent", () => {
      const cap = new SettingsCapability({
        outputPath: ".vscode/settings.json",
        mergeStrategy: "framework-prime",
        consumes: ["mySignal"],
      });
      expect(cap.consumes).toContain("mySignal");
      expect(cap.staticContent).toBeUndefined();
    });

    it("accepts staticContent without consumes", () => {
      const cap = new SettingsCapability({
        outputPath: ".vscode/settings.json",
        mergeStrategy: "framework-prime",
        staticContent: '{"key": true}',
      });
      expect(cap.staticContent).toBe('{"key": true}');
      expect(cap.consumes).toHaveLength(0);
    });

    it("throws when both consumes and staticContent are provided", () => {
      expect(
        () =>
          new SettingsCapability({
            outputPath: ".vscode/settings.json",
            mergeStrategy: "framework-prime",
            consumes: ["mySignal"],
            staticContent: '{"key": true}',
          })
      ).toThrow("SettingsCapability: set either 'consumes' or 'staticContent', not both.");
    });

    it("throws when both staticContent and staticContentAssetFile are provided", () => {
      expect(
        () =>
          new SettingsCapability({
            outputPath: ".vscode/settings.json",
            mergeStrategy: "framework-prime",
            staticContent: '{"key": true}',
            staticContentAssetFile: "vscode-settings.json",
          })
      ).toThrow(
        "SettingsCapability: set either 'staticContent' or 'staticContentAssetFile', not both."
      );
    });

    it("throws when consumes and staticContentAssetFile are both provided", () => {
      expect(
        () =>
          new SettingsCapability({
            outputPath: ".vscode/settings.json",
            mergeStrategy: "framework-prime",
            consumes: ["mySignal"],
            staticContentAssetFile: "vscode-settings.json",
          })
      ).toThrow("SettingsCapability: set either 'consumes' or 'staticContent', not both.");
    });

    it("accepts staticContentAssetFile without consumes", () => {
      const cap = new SettingsCapability({
        outputPath: ".vscode/settings.json",
        mergeStrategy: "framework-prime",
        staticContentAssetFile: "vscode-settings.json",
      });
      expect(cap.staticContentAssetFile).toBe("vscode-settings.json");
      expect(cap.staticContent).toBeUndefined();
      expect(cap.consumes).toHaveLength(0);
    });

    it("accepts neither consumes nor staticContent (empty capability)", () => {
      const cap = new SettingsCapability({
        outputPath: ".vscode/settings.json",
        mergeStrategy: "framework-prime",
      });
      expect(cap.consumes).toHaveLength(0);
      expect(cap.staticContent).toBeUndefined();
    });
  });

  describe("requiresTool", () => {
    it("is undefined when not set", () => {
      const cap = new SettingsCapability({
        outputPath: ".vscode/settings.json",
        mergeStrategy: "framework-prime",
        staticContent: '{"key": true}',
      });
      expect(cap.requiresTool).toBeUndefined();
    });

    it("is set when provided alongside staticContent", () => {
      const cap = new SettingsCapability({
        outputPath: ".vscode/settings.json",
        mergeStrategy: "framework-prime",
        staticContent: '{"key": true}',
        requiresTool: "vscode",
      });
      expect(cap.requiresTool).toBe("vscode");
    });

    it("throws when requiresTool is set without staticContent", () => {
      expect(
        () =>
          new SettingsCapability({
            outputPath: ".vscode/settings.json",
            mergeStrategy: "framework-prime",
            requiresTool: "vscode",
          })
      ).toThrow("SettingsCapability: 'requiresTool' is only meaningful with 'staticContent'.");
    });

    it("accepts staticContentAssetFile with requiresTool", () => {
      const cap = new SettingsCapability({
        outputPath: ".vscode/settings.json",
        mergeStrategy: "framework-prime",
        staticContentAssetFile: "vscode-settings.json",
        requiresTool: "vscode",
      });
      expect(cap.staticContentAssetFile).toBe("vscode-settings.json");
      expect(cap.requiresTool).toBe("vscode");
      expect(cap.staticContent).toBeUndefined();
    });
  });

  describe("buildOutputPath", () => {
    it("returns the configured output path", () => {
      const cap = new SettingsCapability({
        outputPath: ".vscode/settings.json",
        mergeStrategy: "framework-prime",
      });
      expect(cap.buildOutputPath()).toBe(".vscode/settings.json");
    });
  });

  describe("getMergeStrategy", () => {
    it("returns the configured merge strategy", () => {
      const cap = new SettingsCapability({
        outputPath: ".vscode/settings.json",
        mergeStrategy: "user-prime",
      });
      expect(cap.getMergeStrategy()).toBe("user-prime");
    });
  });
});

describe("SettingsCapability path acceptance", () => {
  it("accepts exactly its own output path", () => {
    const cap = new SettingsCapability({
      outputPath: ".vscode/settings.json",
      mergeStrategy: "none",
    });

    expect(cap.accepts(".vscode/settings.json")).toBe(true);
    expect(cap.accepts(".vscode/extensions.json")).toBe(false);
    expect(cap.accepts("x/.vscode/settings.json")).toBe(false);
  });
});

describe("SettingsCapability equality", () => {
  const base = { outputPath: ".vscode/settings.json", mergeStrategy: "none" as const };

  it("is equal on the same output path and merge strategy", () => {
    expect(new SettingsCapability(base).equals(new SettingsCapability({ ...base }))).toBe(true);
  });

  it("differs on the output path", () => {
    expect(
      new SettingsCapability(base).equals(
        new SettingsCapability({ ...base, outputPath: ".vscode/extensions.json" })
      )
    ).toBe(false);
  });

  it("differs on the merge strategy", () => {
    expect(
      new SettingsCapability(base).equals(
        new SettingsCapability({ ...base, mergeStrategy: "user-prime" })
      )
    ).toBe(false);
  });
});
