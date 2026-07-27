import { describe, expect, it } from "vitest";
// Side-effect imports: registering every shipped tool is what makes this suite meaningful.
// A tool missing here would silently escape conformance, so the list must stay complete.
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import "../../../src/domain/tools/ai/copilot.js";
import "../../../src/domain/tools/ai/cursor.js";
import "../../../src/domain/tools/ai/opencode.js";
import { FRAMEWORK_BUILD_TARGET_MODES } from "../../../src/domain/models/framework-build.js";
import {
  MARKETPLACE_PROBES,
  PLUGIN_MANIFEST_PROBES,
} from "../../../src/domain/models/plugin-format.js";
import { AI_TOOL_IDS } from "../../../src/domain/models/tool-ids.js";
import type { AiTool } from "../../../src/domain/tools/contracts.js";
import {
  getAllRegisteredTools,
  getToolConfig,
  isAiTool,
} from "../../../src/domain/tools/registry.js";

/**
 * Conformance suite for the AiTool contract.
 *
 * Every assertion iterates the registry rather than a hardcoded list, so adding a tool file
 * automatically subjects it to all of them: omitting that tool from a parallel list elsewhere
 * fails a test instead of misbehaving at runtime.
 *
 * The probe tables (plugin-format.ts) and the build registry (deps.ts) keep their own literal
 * entries — "a format aidd can read" and "a tool aidd installs into" are distinct concepts
 * that happen to share members. These assertions check the two agree, not that one derives
 * from the other.
 */

const registeredAiTools: [string, AiTool<unknown>][] = [
  ...getAllRegisteredTools().entries(),
].flatMap(([id, config]) =>
  isAiTool(config) ? [[id as string, config] as [string, AiTool<unknown>]] : []
);

describe("AiTool contract conformance", () => {
  it("the registry actually contains tools (guards against a no-op suite)", () => {
    expect(registeredAiTools.length).toBeGreaterThan(0);
  });

  describe.each(registeredAiTools)("%s", (toolId, tool) => {
    it("has a well-formed AiTool shape", () => {
      expect(tool.kind, `${toolId}: kind must be "ai"`).toBe("ai");
      expect(tool.toolId, `${toolId}: toolId must match its registry key`).toBe(toolId);
      expect(
        typeof tool.directory === "string" && tool.directory.length > 0,
        `${toolId}: directory must be a non-empty string`
      ).toBe(true);
      expect(tool.directory.endsWith("/"), `${toolId}: directory must end with "/"`).toBe(true);
      expect(
        typeof tool.toolSuffix === "string" && tool.toolSuffix.startsWith("."),
        `${toolId}: toolSuffix must be a string starting with "."`
      ).toBe(true);
      expect(
        tool.signalDir === null || typeof tool.signalDir === "string",
        `${toolId}: signalDir must be a string or null`
      ).toBe(true);
      expect(
        typeof tool.capabilities === "object" && tool.capabilities !== null,
        `${toolId}: capabilities must be an object`
      ).toBe(true);
    });

    it("implements every required content method", () => {
      for (const method of [
        "rewriteContent",
        "reverseRewriteContent",
        "detectUserFileSectionKey",
      ] as const) {
        expect(typeof tool[method], `${toolId}: ${method} must be a function`).toBe("function");
      }
    });

    it("is declared in AI_TOOL_IDS", () => {
      expect(
        (AI_TOOL_IDS as readonly string[]).includes(toolId),
        `${toolId} is registered but missing from AI_TOOL_IDS (domain/models/tool-ids.ts)`
      ).toBe(true);
    });

    it("is reachable by at least one framework build target/mode", () => {
      expect(
        FRAMEWORK_BUILD_TARGET_MODES.some((entry) => entry.target === toolId),
        `${toolId} is registered but has no entry in FRAMEWORK_BUILD_TARGET_MODES (domain/models/framework-build.ts) — 'aidd framework build --target ${toolId}' would be rejected`
      ).toBe(true);
    });

    it("is ingestible when it declares a plugins capability", () => {
      const declaresPlugins = "plugins" in (tool.capabilities as object);
      if (!declaresPlugins) return;
      expect(
        MARKETPLACE_PROBES.some((probe) => probe.format === toolId),
        `${toolId} declares a plugins capability but has no MARKETPLACE_PROBES entry (domain/models/plugin-format.ts) — its native marketplace would never be detected`
      ).toBe(true);
    });
  });
});

describe("no parallel list references an unregistered tool", () => {
  it("every AI_TOOL_IDS entry resolves to a registered AI tool", () => {
    for (const id of AI_TOOL_IDS) {
      const config = getToolConfig(id);
      expect(isAiTool(config), `AI_TOOL_IDS lists "${id}" but its config is not an AI tool`).toBe(
        true
      );
    }
  });

  it("every FRAMEWORK_BUILD_TARGET_MODES target is a registered AI tool", () => {
    const registered = new Set(registeredAiTools.map(([id]) => id));
    for (const { target } of FRAMEWORK_BUILD_TARGET_MODES) {
      expect(
        registered.has(target),
        `FRAMEWORK_BUILD_TARGET_MODES has an entry for "${target}", which is not a registered AI tool (stale entry?)`
      ).toBe(true);
    }
  });

  it("every probe-table format is a registered AI tool", () => {
    const registered = new Set(registeredAiTools.map(([id]) => id));
    for (const [label, probes] of [
      ["PLUGIN_MANIFEST_PROBES", PLUGIN_MANIFEST_PROBES],
      ["MARKETPLACE_PROBES", MARKETPLACE_PROBES],
    ] as const) {
      for (const probe of probes) {
        expect(
          registered.has(probe.format),
          `${label} has an entry for format "${probe.format}" (${probe.relativePath}), which is not a registered AI tool (stale entry?)`
        ).toBe(true);
      }
    }
  });
});
