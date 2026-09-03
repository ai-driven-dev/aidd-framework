import { describe, expect, it } from "vitest";
import { McpCapability } from "../../../../../src/contexts/tools/domain/capabilities/mcp-capability.js";

const sampleMcpJson = JSON.stringify({
  mcpServers: {
    "my-server": { command: "npx", args: ["my-package"] },
  },
});

const existingJson = JSON.stringify({
  mcpServers: {
    "existing-server": { command: "npx", args: ["existing"] },
  },
});

describe("McpCapability", () => {
  describe("buildOutputPath / accepts", () => {
    it("accepts the exact output path", () => {
      const cap = new McpCapability({ outputPath: ".claude/mcp.json", format: "json" });
      expect(cap.accepts(".claude/mcp.json")).toBe(true);
    });

    it("rejects paths that do not match exactly", () => {
      const cap = new McpCapability({ outputPath: ".claude/mcp.json", format: "json" });
      expect(cap.accepts(".claude/other.json")).toBe(false);
    });
  });

  describe("transform", () => {
    it("returns JSON as-is when format is json", () => {
      const cap = new McpCapability({ outputPath: ".claude/mcp.json", format: "json" });
      expect(cap.transform(sampleMcpJson)).toBe(sampleMcpJson);
    });

    it("converts JSON to TOML when format is toml", () => {
      const cap = new McpCapability({ outputPath: "config.toml", format: "toml" });
      const result = cap.transform(sampleMcpJson);
      expect(result).toContain("my-server");
      expect(result).not.toContain('"mcpServers"');
    });
  });

  describe("merge", () => {
    it("uses injected mergeFn when provided", () => {
      const mergeFn = (_existing: string, incoming: string) => incoming;
      const cap = new McpCapability({ outputPath: ".mcp.json", format: "json", mergeFn });
      expect(cap.merge(existingJson, sampleMcpJson)).toBe(sampleMcpJson);
    });

    it("returns incoming when mergeStrategy is none", () => {
      const cap = new McpCapability({
        outputPath: ".mcp.json",
        format: "json",
        mergeStrategy: "none",
      });
      expect(cap.merge(existingJson, sampleMcpJson)).toBe(sampleMcpJson);
    });

    it("user-prime: existing keys win over incoming keys", () => {
      const existing = JSON.stringify({ key: "existing-value", shared: "keep-me" });
      const incoming = JSON.stringify({ key: "new-value", extra: "added" });
      const cap = new McpCapability({
        outputPath: ".mcp.json",
        format: "json",
        mergeStrategy: "user-prime",
      });
      const result = JSON.parse(cap.merge(existing, incoming)) as Record<string, unknown>;
      expect(result.key).toBe("existing-value");
      expect(result.extra).toBe("added");
      expect(result.shared).toBe("keep-me");
    });
  });

  describe("equals", () => {
    it("returns true for identical params", () => {
      const a = new McpCapability({ outputPath: ".mcp.json", format: "json" });
      const b = new McpCapability({ outputPath: ".mcp.json", format: "json" });
      expect(a.equals(b)).toBe(true);
    });

    it("returns false when outputPath differs", () => {
      const a = new McpCapability({ outputPath: ".mcp.json", format: "json" });
      const b = new McpCapability({ outputPath: "config.toml", format: "json" });
      expect(a.equals(b)).toBe(false);
    });

    it("returns false when format differs", () => {
      const a = new McpCapability({ outputPath: "config.toml", format: "json" });
      const b = new McpCapability({ outputPath: "config.toml", format: "toml" });
      expect(a.equals(b)).toBe(false);
    });
  });
});
