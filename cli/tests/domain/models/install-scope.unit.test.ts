import "../../../src/contexts/tools/domain/profiles/claude.js";
import "../../../src/contexts/tools/domain/profiles/codex.js";
import "../../../src/contexts/tools/domain/profiles/copilot.js";
import "../../../src/contexts/tools/domain/profiles/cursor.js";
import "../../../src/contexts/tools/domain/profiles/opencode.js";
import { describe, expect, it } from "vitest";
import {
  assertToolSupportsScope,
  getToolSupportedScope,
  isInstallScope,
  parseInstallScope,
} from "../../../src/domain/models/install-scope.js";
import { InvalidPluginScopeError } from "../../../src/kernel/errors.js";

describe("install-scope value object", () => {
  describe("isInstallScope", () => {
    it("returns true for project and user", () => {
      expect(isInstallScope("project")).toBe(true);
      expect(isInstallScope("user")).toBe(true);
    });

    it("returns false for any other string", () => {
      expect(isInstallScope("global")).toBe(false);
      expect(isInstallScope("")).toBe(false);
      expect(isInstallScope(undefined)).toBe(false);
    });
  });

  describe("parseInstallScope", () => {
    it("returns undefined for undefined input", () => {
      expect(parseInstallScope(undefined)).toBeUndefined();
    });

    it("returns the scope when valid", () => {
      expect(parseInstallScope("project")).toBe("project");
      expect(parseInstallScope("user")).toBe("user");
    });

    it("throws on invalid value", () => {
      expect(() => parseInstallScope("global")).toThrow(/Invalid scope/);
    });
  });

  describe("getToolSupportedScope", () => {
    it("returns user for cursor", () => {
      expect(getToolSupportedScope("cursor")).toBe("user");
    });

    it("returns project for claude/codex/copilot/opencode", () => {
      expect(getToolSupportedScope("claude")).toBe("project");
      expect(getToolSupportedScope("codex")).toBe("project");
      expect(getToolSupportedScope("copilot")).toBe("project");
      expect(getToolSupportedScope("opencode")).toBe("project");
    });
  });

  describe("assertToolSupportsScope", () => {
    it("does not throw when requested scope matches tool's supported scope", () => {
      expect(() => assertToolSupportsScope("cursor", "user")).not.toThrow();
      expect(() => assertToolSupportsScope("claude", "project")).not.toThrow();
    });

    it("throws InvalidPluginScopeError on mismatch", () => {
      expect(() => assertToolSupportsScope("cursor", "project")).toThrow(InvalidPluginScopeError);
      expect(() => assertToolSupportsScope("claude", "user")).toThrow(InvalidPluginScopeError);
      expect(() => assertToolSupportsScope("copilot", "user")).toThrow(InvalidPluginScopeError);
    });
  });
});
