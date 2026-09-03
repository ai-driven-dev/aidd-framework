import { describe, expect, it } from "vitest";
// Side-effect imports: registering every shipped tool is what makes this suite meaningful.
// A tool missing here would silently escape conformance, so the list must stay complete.
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import type { AiTool } from "../../../../src/contexts/tools/domain/contracts.js";
import {
  frameworkBuildModeFor,
  getAllRegisteredTools,
  getToolConfig,
  isAiTool,
  machineLocalFilesOf,
} from "../../../../src/contexts/tools/domain/registry.js";
import {
  buildTargetModesOf,
  frameworkBuildTargetModes,
} from "../../../../src/contexts/translate/domain/build-target.js";
import {
  distributionProbesOf,
  marketplaceProbes,
} from "../../../../src/contexts/translate/domain/plugin-format.js";
import { AI_TOOL_IDS, type ToolId } from "../../../../src/kernel/tool.js";

/**
 * Conformance suite for the AiTool contract.
 *
 * Every assertion iterates the registry rather than a hardcoded list, so adding a tool file
 * automatically subjects it to all of them: omitting that tool from a parallel list elsewhere
 * fails a test instead of misbehaving at runtime.
 *
 * Since phase 10 the build targets and the probe tables derive from those same profiles, so
 * "they agree" is no longer a claim worth asserting — it cannot be false. What replaces it is
 * a probe of each derivation over synthetic tools, where a profile declaring nothing is a case
 * the live registry can never present.
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
      for (const method of ["rewriteContent"] as const) {
        expect(typeof tool[method], `${toolId}: ${method} must be a function`).toBe("function");
      }
    });

    it("is declared in AI_TOOL_IDS", () => {
      expect(
        (AI_TOOL_IDS as readonly string[]).includes(toolId),
        `${toolId} is registered but missing from AI_TOOL_IDS (kernel/tool.ts)`
      ).toBe(true);
    });

    it("is reachable by at least one framework build target/mode", () => {
      expect(
        frameworkBuildTargetModes().some((entry) => entry.target === toolId),
        `${toolId} is registered but declares no buildContracts — 'aidd translate --to ${toolId}' would be rejected`
      ).toBe(true);
    });

    it("is ingestible when it declares a plugins capability", () => {
      const declaresPlugins = "plugins" in (tool.capabilities as object);
      if (!declaresPlugins) return;
      expect(
        marketplaceProbes().some((probe) => probe.format === toolId),
        `${toolId} declares a plugins capability but its profile declares no marketplace probe — its native marketplace would never be detected`
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
});

/** A profile reduced to the two fields each derivation reads. */
function fakeTool(overrides: Partial<AiTool<unknown>>): AiTool<unknown> {
  return {
    kind: "ai",
    toolId: "claude",
    directory: ".fake/",
    toolSuffix: ".md",
    signalDir: null,
    capabilities: {},
    rewriteContent: (content) => content,
    ...overrides,
  };
}

function registryOf(...tools: AiTool<unknown>[]): ReadonlyMap<ToolId, AiTool<unknown>> {
  return new Map(tools.map((tool) => [tool.toolId, tool]));
}

describe("buildTargetModesOf()", () => {
  it("gives a tool one pair per contract it declares, and none for what it omits", () => {
    const contract = () => ({}) as never;
    const modes = buildTargetModesOf(
      registryOf(
        fakeTool({ toolId: "claude", buildContracts: { marketplace: contract, flat: contract } }),
        fakeTool({ toolId: "opencode", buildContracts: { flat: contract } })
      )
    );
    expect(modes).toEqual([
      { target: "claude", mode: "marketplace" },
      { target: "claude", mode: "flat" },
      { target: "opencode", mode: "flat" },
    ]);
  });

  it("excludes a registered tool that declares no build contract at all", () => {
    expect(buildTargetModesOf(registryOf(fakeTool({ toolId: "cursor" })))).toEqual([]);
  });
});

describe("distributionProbesOf()", () => {
  // Order is behaviour: the reader takes the first probe that resolves, and a bare
  // `plugin.json` at the root is satisfied by almost any directory. A specific path must
  // therefore be tried first, whichever tool declared it.
  it("puts the deepest path first and a bare filename last", () => {
    const probes = distributionProbesOf(
      registryOf(
        fakeTool({ toolId: "claude", distributionProbes: { manifest: ["plugin.json"] } }),
        fakeTool({
          toolId: "copilot",
          distributionProbes: { manifest: [".plugin/plugin.json", ".a/b/plugin.json"] },
        })
      ),
      "manifest"
    );
    expect(probes.map((probe) => probe.relativePath)).toEqual([
      ".a/b/plugin.json",
      ".plugin/plugin.json",
      "plugin.json",
    ]);
  });

  it("reads the kind it was asked for, and nothing from a profile that declares none", () => {
    const tools = registryOf(
      fakeTool({ toolId: "claude", distributionProbes: { marketplace: ["m.json"] } }),
      fakeTool({ toolId: "cursor" })
    );
    expect(distributionProbesOf(tools, "marketplace")).toEqual([
      { format: "claude", relativePath: "m.json" },
    ]);
    expect(distributionProbesOf(tools, "manifest")).toEqual([]);
  });
});

describe("frameworkBuildModeFor()", () => {
  it("gives a flat tool a flat build", () => {
    expect(frameworkBuildModeFor("opencode")).toBe("flat");
  });

  it("gives a native tool a marketplace build", () => {
    expect(frameworkBuildModeFor("claude")).toBe("marketplace");
  });

  it("reads every tool's mode from its profile, never from its name", () => {
    for (const toolId of AI_TOOL_IDS) {
      const config = getToolConfig(toolId);
      if (!isAiTool(config)) continue;
      const caps = config.capabilities as { plugins?: { mode?: string } };
      const expected = caps.plugins?.mode === "flat" ? "flat" : "marketplace";
      expect(frameworkBuildModeFor(toolId), toolId).toBe(expected);
    }
  });
});

describe("machineLocalFilesOf()", () => {
  // `status` scans a tool's directory and calls anything untracked an addition. It
  // skips these files by comparing the path the profile declares against the path it
  // built from the directory, so a profile declaring `settings.local.json` instead of
  // `.claude/settings.local.json` would silently stop being skipped. Declaring the
  // path project-relative is the invariant that keeps the two forms comparable.
  it("declares every machine-local file project-relative, inside its own tool directory", () => {
    for (const toolId of AI_TOOL_IDS) {
      const config = getToolConfig(toolId);
      if (!isAiTool(config)) continue;
      for (const relativePath of machineLocalFilesOf(toolId)) {
        expect(relativePath.startsWith(config.directory), `${toolId}: ${relativePath}`).toBe(true);
      }
    }
  });
});
