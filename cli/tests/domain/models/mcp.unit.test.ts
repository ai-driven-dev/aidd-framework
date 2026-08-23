import { describe, expect, it } from "vitest";
import { InstallationFile } from "../../../src/domain/models/file.js";
import {
  computeMcpExclusions,
  detectNewMcpEntries,
  extractMcpKeys,
  filterMcpExclusions,
  transformFor,
} from "../../../src/domain/models/mcp-exclusion.js";
import type { MergeFileEntry } from "../../../src/domain/models/merge.js";
import type { Hasher } from "../../../src/domain/ports/hasher.js";
import { DeterministicHasher } from "../../helpers/ports/deterministic-hasher.js";

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

const hasher: Hasher = new DeterministicHasher();

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

function makeMcpFile(
  relativePath: string,
  servers: Record<string, object>,
  frameworkPath = "config/mcp.json"
): InstallationFile {
  const content = JSON.stringify({ mcpServers: servers }, null, 2);
  return new InstallationFile({
    relativePath,
    content,
    hash: hasher.hash(content),
    mergeStrategy: "framework-prime",
    frameworkPath,
  });
}

function makeRegularFile(relativePath: string): InstallationFile {
  return new InstallationFile({
    relativePath,
    content: "# doc",
    hash: hasher.hash("# doc"),
    mergeStrategy: "none",
  });
}

const lookup = new Map([["config/mcp.json", "mcp"]]);
const mcpGetEntrySection = makeGetEntrySection("mcpServers", lookup);

// ── extractMcpKeys ───────────────────────────────────────────────────────────

describe("extractMcpKeys()", () => {
  it("returns server keys for MCP-capable merge files", () => {
    const file = makeMcpFile(".mcp.json", { github: {}, playwright: {} });
    const result = extractMcpKeys([file], mcpGetEntrySection);
    expect(result.get(".mcp.json")).toEqual(["github", "playwright"]);
  });

  it("skips regular (non-merge) files", () => {
    const file = makeRegularFile("README.md");
    const result = extractMcpKeys([file], mcpGetEntrySection);
    expect(result.size).toBe(0);
  });

  it("skips files whose frameworkPath is not in the lookup", () => {
    const file = makeMcpFile(".mcp.json", { github: {} }, "unknown/path.json");
    const result = extractMcpKeys([file], mcpGetEntrySection);
    expect(result.size).toBe(0);
  });

  it("skips files where getEntrySection returns null sectionKey", () => {
    const file = makeMcpFile(".mcp.json", { github: {} });
    const result = extractMcpKeys([file], makeGetEntrySection(null, lookup));
    expect(result.size).toBe(0);
  });

  it("returns empty map when no MCP content exists", () => {
    const file = makeMcpFile(".mcp.json", {});
    const result = extractMcpKeys([file], mcpGetEntrySection);
    expect(result.size).toBe(0);
  });
});

// ── filterMcpExclusions ──────────────────────────────────────────────────────

describe("filterMcpExclusions()", () => {
  it("removes excluded server keys from file content", () => {
    const file = makeMcpFile(".mcp.json", { github: {}, playwright: {} });
    const exclusions = [{ configPath: ".mcp.json", entryKey: "github" }];
    const result = filterMcpExclusions([file], mcpGetEntrySection, exclusions, hasher);
    const parsed = JSON.parse(result[0].content) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(parsed.mcpServers)).toEqual(["playwright"]);
  });

  it("returns the original array reference when exclusions is empty", () => {
    const file = makeMcpFile(".mcp.json", { github: {} });
    const input = [file];
    const result = filterMcpExclusions(input, mcpGetEntrySection, [], hasher);
    expect(result).toBe(input);
  });

  it("passes through regular files untouched", () => {
    const regular = makeRegularFile("README.md");
    const exclusions = [{ configPath: "README.md", entryKey: "anything" }];
    const result = filterMcpExclusions([regular], mcpGetEntrySection, exclusions, hasher);
    expect(result[0]).toBe(regular);
  });

  it("passes through MCP files with no matching exclusions", () => {
    const file = makeMcpFile(".mcp.json", { github: {}, playwright: {} });
    const exclusions = [{ configPath: ".cursor/mcp.json", entryKey: "github" }];
    const result = filterMcpExclusions([file], mcpGetEntrySection, exclusions, hasher);
    expect(result[0].content).toBe(file.content);
  });
});

// ── computeMcpExclusions ─────────────────────────────────────────────────────

describe("computeMcpExclusions()", () => {
  it("returns entries not present in selectedKeys", () => {
    const file = makeMcpFile(".mcp.json", { github: {}, playwright: {} });
    const selected = new Set(["playwright"]);
    const result = computeMcpExclusions([file], mcpGetEntrySection, selected);
    expect(result).toEqual([{ configPath: ".mcp.json", entryKey: "github" }]);
  });

  it("returns empty when all keys are selected", () => {
    const file = makeMcpFile(".mcp.json", { github: {}, playwright: {} });
    const selected = new Set(["github", "playwright"]);
    const result = computeMcpExclusions([file], mcpGetEntrySection, selected);
    expect(result).toHaveLength(0);
  });

  it("returns all entries when selectedKeys is empty", () => {
    const file = makeMcpFile(".mcp.json", { github: {}, playwright: {} });
    const result = computeMcpExclusions([file], mcpGetEntrySection, new Set());
    expect(result).toHaveLength(2);
  });
});

// ── detectNewMcpEntries ──────────────────────────────────────────────────────

describe("detectNewMcpEntries()", () => {
  const knownEntry: MergeFileEntry = {
    relativePath: ".mcp.json",
    sectionKey: "mcpServers",
    entries: { github: hasher.hash("github") },
  };

  it("detects entries in distribution not tracked in manifest", () => {
    const file = makeMcpFile(".mcp.json", { github: {}, playwright: {} });
    const result = detectNewMcpEntries([file], mcpGetEntrySection, [knownEntry], []);
    expect(result).toEqual([{ configPath: ".mcp.json", entryKey: "playwright" }]);
  });

  it("returns empty when all distribution entries are already known", () => {
    const file = makeMcpFile(".mcp.json", { github: {} });
    const result = detectNewMcpEntries([file], mcpGetEntrySection, [knownEntry], []);
    expect(result).toHaveLength(0);
  });

  it("skips entries that are already in excluded list", () => {
    const file = makeMcpFile(".mcp.json", { github: {}, playwright: {} });
    const excluded = [{ configPath: ".mcp.json", entryKey: "playwright" }];
    const result = detectNewMcpEntries([file], mcpGetEntrySection, [knownEntry], excluded);
    expect(result).toHaveLength(0);
  });

  it("treats all entries as new when manifest has no entry for this file", () => {
    const file = makeMcpFile(".mcp.json", { github: {}, playwright: {} });
    const result = detectNewMcpEntries([file], mcpGetEntrySection, [], []);
    expect(result).toHaveLength(2);
  });
});
