import { describe, expect, it } from "vitest";
import {
  deepMerge,
  mcpJsonToToml,
  mergeJsonUserPrime,
} from "../../../../../src/contexts/tools/domain/formats/mcp-format.js";

function mcpJson(servers: Record<string, unknown>): string {
  return JSON.stringify({ mcpServers: servers });
}

describe("mcpJsonToToml", () => {
  describe("a stdio server", () => {
    it("carries its command alone when nothing else is declared", () => {
      expect(mcpJsonToToml(mcpJson({ fs: { command: "npx" } }))).toBe(
        '[mcp_servers.fs]\ncommand = "npx"\n'
      );
    });

    it("carries args, cwd, every universal field, and env as its own table", () => {
      const toml = mcpJsonToToml(
        mcpJson({
          fs: {
            command: "npx",
            args: ["-y", "x"],
            env: { A: "1" },
            cwd: "/w",
            startup_timeout_sec: 5,
            tool_timeout_sec: 9,
            enabled: true,
            required: false,
            enabled_tools: ["a"],
            disabled_tools: ["b"],
          },
        })
      );

      expect(toml).toBe(
        [
          "[mcp_servers.fs]",
          'command = "npx"',
          'args = [ "-y", "x" ]',
          'cwd = "/w"',
          "startup_timeout_sec = 5",
          "tool_timeout_sec = 9",
          "enabled = true",
          "required = false",
          'enabled_tools = [ "a" ]',
          'disabled_tools = [ "b" ]',
          "",
          "[mcp_servers.fs.env]",
          'A = "1"',
          "",
        ].join("\n")
      );
    });

    it("drops a field the source spells but Codex does not read", () => {
      expect(mcpJsonToToml(mcpJson({ fs: { command: "npx", type: "stdio" } }))).toBe(
        '[mcp_servers.fs]\ncommand = "npx"\n'
      );
    });
  });

  describe("an http server", () => {
    it("carries its url alone when nothing else is declared", () => {
      expect(mcpJsonToToml(mcpJson({ web: { url: "https://h" } }))).toBe(
        '[mcp_servers.web]\nurl = "https://h"\n'
      );
    });

    it("renames bearerTokenEnvVar to Codex's own spelling and keeps both header maps", () => {
      const toml = mcpJsonToToml(
        mcpJson({
          web: {
            url: "https://h",
            bearerTokenEnvVar: "T",
            http_headers: { X: "1" },
            env_http_headers: { Y: "Z" },
            tool_timeout_sec: 2,
          },
        })
      );

      expect(toml).toBe(
        [
          "[mcp_servers.web]",
          'url = "https://h"',
          'bearer_token_env_var = "T"',
          "tool_timeout_sec = 2",
          "",
          "[mcp_servers.web.http_headers]",
          'X = "1"',
          "",
          "[mcp_servers.web.env_http_headers]",
          'Y = "Z"',
          "",
        ].join("\n")
      );
    });

    it("carries every universal field an http server declares", () => {
      const toml = mcpJsonToToml(
        mcpJson({
          web: {
            url: "https://h",
            startup_timeout_sec: 1,
            enabled: false,
            required: true,
            enabled_tools: ["a"],
            disabled_tools: [],
          },
        })
      );

      expect(toml).toBe(
        [
          "[mcp_servers.web]",
          'url = "https://h"',
          "startup_timeout_sec = 1",
          "enabled = false",
          "required = true",
          'enabled_tools = [ "a" ]',
          "disabled_tools = []",
          "",
        ].join("\n")
      );
    });
  });

  it("emits an empty table for a server that is neither stdio nor http", () => {
    expect(mcpJsonToToml(mcpJson({ odd: { transport: "sse" } }))).toBe("[mcp_servers.odd]\n");
  });

  it("emits nothing when the source declares no server", () => {
    expect(mcpJsonToToml(mcpJson({}))).toBe("");
    expect(mcpJsonToToml("{}")).toBe("");
  });
});

describe("mergeJsonUserPrime", () => {
  it("takes the incoming document whole when nothing existed", () => {
    expect(mergeJsonUserPrime("", '{"mcpServers":{"a":{"command":"x"}}}')).toBe(
      JSON.stringify({ mcpServers: { a: { command: "x" } } }, null, 2)
    );
  });

  it("treats a whitespace-only existing file as absent rather than as malformed", () => {
    expect(mergeJsonUserPrime(" \n", '{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it("keeps the existing value of a key both sides declare", () => {
    expect(JSON.parse(mergeJsonUserPrime('{"a":1,"b":2}', '{"a":9,"c":3}'))).toStrictEqual({
      a: 1,
      c: 3,
      b: 2,
    });
  });

  it("merges nested objects key by key, the existing side winning", () => {
    const merged = mergeJsonUserPrime(
      '{"mcpServers":{"a":{"command":"user"}}}',
      '{"mcpServers":{"a":{"command":"plugin","args":["-y"]},"b":{"command":"y"}}}'
    );

    expect(JSON.parse(merged)).toStrictEqual({
      mcpServers: { a: { command: "user", args: ["-y"] }, b: { command: "y" } },
    });
  });
});

describe("deepMerge", () => {
  it("replaces an array rather than merging it as an object", () => {
    expect(deepMerge({ a: { b: 1 } }, { a: [1] })).toStrictEqual({ a: [1] });
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toStrictEqual({ a: [3] });
  });

  it("lets a null from the source replace an object in the target", () => {
    expect(deepMerge({ a: { b: 1 } }, { a: null })).toStrictEqual({ a: null });
  });

  it("recurses into an object both sides carry, and leaves the target's other keys", () => {
    expect(deepMerge({ a: { b: 1, c: { d: 1 } }, e: 5 }, { a: { c: { f: 2 } } })).toStrictEqual({
      a: { b: 1, c: { d: 1, f: 2 } },
      e: 5,
    });
  });

  it("copies a source object over a scalar in the target", () => {
    expect(deepMerge({ a: 1 }, { a: { b: 2 } })).toStrictEqual({ a: { b: 2 } });
  });
});
