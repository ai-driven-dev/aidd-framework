import { describe, expect, it } from "vitest";
import { flatMcpSectionKey } from "../../../../src/application/use-cases/plugin/plugin-helpers.js";
import { McpCapability } from "../../../../src/domain/capabilities/mcp-capability.js";
import { PluginsCapability } from "../../../../src/domain/capabilities/plugins-capability.js";
import { McpSectionUndeclaredError } from "../../../../src/domain/errors.js";
import { CONFIG_MCP } from "../../../../src/domain/models/framework.js";

const FLAT_PLUGINS = new PluginsCapability({ mode: "flat", flatNamespacePrefix: "aidd-" });

function mcpCapability(entrySection?: string): McpCapability {
  return new McpCapability({
    outputPath: ".tool/settings.json",
    format: "json",
    mergeStrategy: "framework-prime",
    consumes: [CONFIG_MCP],
    ...(entrySection === undefined ? {} : { entrySection }),
  });
}

describe("flatMcpSectionKey", () => {
  it("returns the key the tool declared", () => {
    const caps = { mcp: mcpCapability("mcpServers"), plugins: FLAT_PLUGINS };

    expect(flatMcpSectionKey(caps, "gemini")).toBe("mcpServers");
  });

  it("declines a tool with no mcp capability", () => {
    expect(flatMcpSectionKey({ plugins: FLAT_PLUGINS }, "some-tool")).toBeNull();
  });

  it("declines a tool whose plugins are not flat", () => {
    const caps = {
      mcp: mcpCapability("mcpServers"),
      plugins: new PluginsCapability({ mode: "unsupported" }),
    };

    expect(flatMcpSectionKey(caps, "some-tool")).toBeNull();
  });

  it("declines a tool that does not merge under framework-prime", () => {
    const caps = {
      mcp: new McpCapability({
        outputPath: ".tool/settings.json",
        format: "json",
        entrySection: "mcpServers",
        mergeStrategy: "user-prime",
        consumes: [CONFIG_MCP],
      }),
      plugins: FLAT_PLUGINS,
    };

    expect(flatMcpSectionKey(caps, "some-tool")).toBeNull();
  });

  it("throws rather than guessing when a qualifying tool declares no section", () => {
    const caps = { mcp: mcpCapability(), plugins: FLAT_PLUGINS };

    expect(() => flatMcpSectionKey(caps, "some-tool")).toThrow(McpSectionUndeclaredError);
  });
});
