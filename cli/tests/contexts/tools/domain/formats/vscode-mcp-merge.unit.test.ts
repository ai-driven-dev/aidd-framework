import { describe, expect, it } from "vitest";
import { mergeVscodeMcp } from "../../../../../src/contexts/tools/domain/formats/vscode-mcp-merge.js";

const PLUGIN_SERVER = { command: "node", args: ["server.js"] };

describe("mergeVscodeMcp", () => {
  describe("empty existing", () => {
    it("writes all incoming keys into a fresh servers object", () => {
      const { mergedContent, collisions } = mergeVscodeMcp(
        null,
        { "aidd-dev-mcp": PLUGIN_SERVER },
        false
      );
      const parsed = JSON.parse(mergedContent) as { servers: Record<string, unknown> };
      expect(parsed.servers["aidd-dev-mcp"]).toEqual(PLUGIN_SERVER);
      expect(collisions).toHaveLength(0);
    });

    it("produces valid JSON with 2-space indent and trailing newline", () => {
      const { mergedContent } = mergeVscodeMcp(null, { "aidd-dev-mcp": PLUGIN_SERVER }, false);
      expect(mergedContent).toBe(
        `${JSON.stringify({ servers: { "aidd-dev-mcp": PLUGIN_SERVER } }, null, 2)}\n`
      );
    });
  });

  describe("existing with user-owned keys", () => {
    it("preserves user-owned servers alongside incoming", () => {
      const existing = JSON.stringify({
        servers: { "user-custom": { command: "myserver" } },
      });
      const { mergedContent, collisions } = mergeVscodeMcp(
        existing,
        { "aidd-dev-mcp": PLUGIN_SERVER },
        false
      );
      const parsed = JSON.parse(mergedContent) as { servers: Record<string, unknown> };
      expect(parsed.servers["user-custom"]).toEqual({ command: "myserver" });
      expect(parsed.servers["aidd-dev-mcp"]).toEqual(PLUGIN_SERVER);
      expect(collisions).toHaveLength(0);
    });

    it("preserves other top-level keys in the document", () => {
      const existing = JSON.stringify({ inputs: [], servers: {} });
      const { mergedContent } = mergeVscodeMcp(existing, { "aidd-dev-mcp": PLUGIN_SERVER }, false);
      const parsed = JSON.parse(mergedContent) as { inputs: unknown[]; servers: unknown };
      expect(parsed.inputs).toEqual([]);
    });
  });

  describe("user key sharing plugin prefix", () => {
    it("preserves user-owned key that starts with plugin prefix", () => {
      const existing = JSON.stringify({
        servers: { "aidd-personal": { command: "mine" } },
      });
      const { mergedContent, collisions } = mergeVscodeMcp(
        existing,
        { "aidd-dev-mcp": PLUGIN_SERVER },
        false
      );
      const parsed = JSON.parse(mergedContent) as { servers: Record<string, unknown> };
      expect(parsed.servers["aidd-personal"]).toEqual({ command: "mine" });
      expect(parsed.servers["aidd-dev-mcp"]).toEqual(PLUGIN_SERVER);
      expect(collisions).toHaveLength(0);
    });
  });

  describe("collision without force", () => {
    it("skips the key and returns it in collisions", () => {
      const existing = JSON.stringify({
        servers: { "aidd-dev-mcp": { command: "old" } },
      });
      const { mergedContent, collisions } = mergeVscodeMcp(
        existing,
        { "aidd-dev-mcp": PLUGIN_SERVER },
        false
      );
      const parsed = JSON.parse(mergedContent) as { servers: Record<string, unknown> };
      expect((parsed.servers["aidd-dev-mcp"] as { command: string }).command).toBe("old");
      expect(collisions).toEqual(["aidd-dev-mcp"]);
    });
  });

  describe("collision with force", () => {
    it("overwrites the colliding key and returns no collisions", () => {
      const existing = JSON.stringify({
        servers: { "aidd-dev-mcp": { command: "old" } },
      });
      const { mergedContent, collisions } = mergeVscodeMcp(
        existing,
        { "aidd-dev-mcp": PLUGIN_SERVER },
        true
      );
      const parsed = JSON.parse(mergedContent) as { servers: Record<string, unknown> };
      expect(parsed.servers["aidd-dev-mcp"]).toEqual(PLUGIN_SERVER);
      expect(collisions).toHaveLength(0);
    });
  });

  describe("idempotency (second run with force)", () => {
    it("produces byte-identical merged content when re-run with same input", () => {
      const { mergedContent: firstRun } = mergeVscodeMcp(
        null,
        { "aidd-dev-mcp": PLUGIN_SERVER },
        true
      );
      const { mergedContent: secondRun } = mergeVscodeMcp(
        firstRun,
        { "aidd-dev-mcp": PLUGIN_SERVER },
        true
      );
      expect(secondRun).toBe(firstRun);
    });
  });

  describe("insertion order", () => {
    it("preserves existing server key order and appends new keys", () => {
      const existing = JSON.stringify({ servers: { "a-server": {}, "b-server": {} } });
      const { mergedContent } = mergeVscodeMcp(existing, { "c-server": PLUGIN_SERVER }, false);
      const parsed = JSON.parse(mergedContent) as { servers: Record<string, unknown> };
      const keys = Object.keys(parsed.servers);
      expect(keys).toEqual(["a-server", "b-server", "c-server"]);
    });
  });
});
