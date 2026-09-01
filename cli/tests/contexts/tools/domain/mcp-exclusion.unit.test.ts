import { describe, expect, it } from "vitest";
import { transformFor } from "../../../../src/contexts/tools/domain/mcp-exclusion.js";
import { InstallationFile } from "../../../../src/kernel/file.js";
import type { Hasher } from "../../../../src/kernel/ports/hasher.js";

function makeConfig(servers: Record<string, object>): string {
  return JSON.stringify({ mcpServers: servers }, null, 2);
}

describe("transformFor()", () => {
  it("returns undefined for linux", () => {
    expect(transformFor("linux")).toBeUndefined();
  });

  it("returns undefined for darwin", () => {
    expect(transformFor("darwin")).toBeUndefined();
  });

  it("returns a transform for win32", () => {
    expect(transformFor("win32")).toBeDefined();
  });

  describe("win32 transform", () => {
    // biome-ignore lint/style/noNonNullAssertion: win32 is asserted defined in the test above
    const transform = transformFor("win32")!;

    it("transforms npx without existing args", () => {
      const result = JSON.parse(transform(makeConfig({ server: { command: "npx", args: [] } })));
      expect(result.mcpServers.server.command).toBe("cmd");
      expect(result.mcpServers.server.args).toEqual(["/c", "npx"]);
    });

    it("transforms npx with existing args", () => {
      const result = JSON.parse(
        transform(makeConfig({ server: { command: "npx", args: ["-y", "some-pkg"] } }))
      );
      expect(result.mcpServers.server.command).toBe("cmd");
      expect(result.mcpServers.server.args).toEqual(["/c", "npx", "-y", "some-pkg"]);
    });

    it("transforms uvx command", () => {
      const result = JSON.parse(transform(makeConfig({ server: { command: "uvx" } })));
      expect(result.mcpServers.server.command).toBe("uvx.exe");
    });

    it("transforms uv command", () => {
      const result = JSON.parse(
        transform(makeConfig({ server: { command: "uv", args: ["run", "mcp"] } }))
      );
      expect(result.mcpServers.server.command).toBe("uv.exe");
      expect(result.mcpServers.server.args).toEqual(["run", "mcp"]);
    });

    it("leaves node command unchanged", () => {
      const result = JSON.parse(
        transform(makeConfig({ server: { command: "node", args: ["server.js"] } }))
      );
      expect(result.mcpServers.server.command).toBe("node");
    });

    it("leaves docker command unchanged", () => {
      const result = JSON.parse(
        transform(makeConfig({ server: { command: "docker", args: ["run", "img"] } }))
      );
      expect(result.mcpServers.server.command).toBe("docker");
    });

    it("leaves http server entries unchanged", () => {
      const result = JSON.parse(
        transform(makeConfig({ server: { url: "http://localhost:3000" } }))
      );
      expect(result.mcpServers.server).toEqual({ url: "http://localhost:3000" });
    });

    it("handles empty mcpServers", () => {
      const result = JSON.parse(transform(JSON.stringify({ mcpServers: {} })));
      expect(result.mcpServers).toEqual({});
    });

    it("throws on invalid JSON", () => {
      expect(() => transform("not-json")).toThrow();
    });
  });
});

// ── Helpers for domain function tests ────────────────────────────────────────

const _stubHasher: Hasher = { hash: (v) => v as unknown as ReturnType<Hasher["hash"]> };

function makeGetEntrySection(
  sectionKey: string | null,
  lookup: Map<string, string>
): (frameworkPath: string) => string | null {
  return (frameworkPath) => {
    const configName = lookup.get(frameworkPath);
    if (!configName) return null;
    return sectionKey;
  };
}

function _makeMcpFile(
  relativePath: string,
  servers: Record<string, object>,
  frameworkPath = "config/mcp.json"
): InstallationFile {
  const content = JSON.stringify({ mcpServers: servers }, null, 2);
  return new InstallationFile({
    relativePath,
    content,
    hash: content as unknown as ReturnType<Hasher["hash"]>,
    mergeStrategy: "framework-prime",
    frameworkPath,
  });
}

function _makeRegularFile(relativePath: string): InstallationFile {
  return new InstallationFile({
    relativePath,
    content: "# doc",
    hash: "h" as unknown as ReturnType<Hasher["hash"]>,
    mergeStrategy: "none",
  });
}

const lookup = new Map([["config/mcp.json", "mcp"]]);
const _mcpGetEntrySection = makeGetEntrySection("mcpServers", lookup);

// ── extractMcpKeys ───────────────────────────────────────────────────────────

// ── filterMcpExclusions ──────────────────────────────────────────────────────

// ── computeMcpExclusions ─────────────────────────────────────────────────────

// ── detectNewMcpEntries ──────────────────────────────────────────────────────
