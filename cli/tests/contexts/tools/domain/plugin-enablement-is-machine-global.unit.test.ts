import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { pluginEnablementIsMachineGlobal } from "../../../../src/contexts/tools/domain/registry.js";

describe("pluginEnablementIsMachineGlobal", () => {
  it("is true for a tool declaring no scopeArgs at all (codex)", () => {
    expect(pluginEnablementIsMachineGlobal("codex")).toBe(true);
  });

  it("is true for a tool declaring no scopeArgs at all (copilot)", () => {
    expect(pluginEnablementIsMachineGlobal("copilot")).toBe(true);
  });

  it("is false for a tool declaring scopeArgs per scope (claude)", () => {
    expect(pluginEnablementIsMachineGlobal("claude")).toBe(false);
  });

  it("is true for a tool with no native activation at all (cursor)", () => {
    // No `NativeActivation` declared, so `scopeArgs` is vacuously `undefined` — never asked
    // of a ref in practice, since a caller reaches here only for a tool that has one.
    expect(pluginEnablementIsMachineGlobal("cursor")).toBe(true);
  });
});
