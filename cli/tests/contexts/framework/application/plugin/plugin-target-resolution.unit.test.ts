import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import {
  isFrameworkPrimeFlatMcp,
  resolveBaseDirFromRecord,
  resolvePluginToolIds,
  resolveScopeForInstall,
} from "../../../../../src/contexts/framework/application/plugin/plugin-target-resolution.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { McpCapability } from "../../../../../src/contexts/tools/domain/capabilities/mcp-capability.js";
import { PluginsCapability } from "../../../../../src/contexts/tools/domain/capabilities/plugins-capability.js";
import { UnresolvableUserScopeError } from "../../../../../src/kernel/errors.js";

const HOME = "/home/u";
const homedir = () => HOME;

function mcp(mergeStrategy?: "user-prime" | "framework-prime"): McpCapability {
  return new McpCapability({ outputPath: "mcp.json", format: "json", mergeStrategy });
}

const FLAT_PLUGINS = new PluginsCapability({
  mode: "flat",
  flatNamespacePrefix: "x-",
  acceptsHooks: false,
  hooksUnsupportedReason: "none",
});
const NATIVE_PLUGINS = new PluginsCapability({
  mode: "native",
  pluginsDir: ".x/plugins/",
  pluginManifestRelativePath: null,
  acceptsHooks: false,
  hooksUnsupportedReason: "none",
});

describe("resolvePluginToolIds()", () => {
  it("resolves 'all' to the AI tools the manifest holds, in registry order", () => {
    const manifest = Manifest.create();
    manifest.addTool("cursor", "1.0.0", []);
    manifest.addTool("claude", "1.0.0", []);

    expect(resolvePluginToolIds("all", manifest)).toStrictEqual(["claude", "cursor"]);
  });
});

describe("isFrameworkPrimeFlatMcp()", () => {
  it("fails for a tool declaring no MCP capability", () => {
    expect(isFrameworkPrimeFlatMcp({ plugins: FLAT_PLUGINS })).toBe(false);
  });

  it("fails for an mcp declaration that is not a capability", () => {
    expect(isFrameworkPrimeFlatMcp({ mcp: "framework-prime", plugins: FLAT_PLUGINS })).toBe(false);
  });

  it("fails for a flat tool merging MCP user-prime", () => {
    expect(isFrameworkPrimeFlatMcp({ mcp: mcp("user-prime"), plugins: FLAT_PLUGINS })).toBe(false);
  });

  it("fails for a flat tool declaring no merge strategy", () => {
    expect(isFrameworkPrimeFlatMcp({ mcp: mcp(), plugins: FLAT_PLUGINS })).toBe(false);
  });

  it("fails for a native tool merging MCP framework-prime", () => {
    expect(isFrameworkPrimeFlatMcp({ mcp: mcp("framework-prime"), plugins: NATIVE_PLUGINS })).toBe(
      false
    );
  });
});

describe("resolveScopeForInstall()", () => {
  it("reads the scope a fresh install writes from the tool's own profile", () => {
    expect(resolveScopeForInstall("cursor")).toBe("user");
    expect(resolveScopeForInstall("claude")).toBe("project");
  });
});

describe("resolveBaseDirFromRecord() — the manifest's recorded scope, not the profile", () => {
  it("resolves project scope to projectRoot regardless of what the tool's profile says", () => {
    // cursor's own profile declares installScope "user", so a manifest entry recorded
    // scope: "project" must still resolve under projectRoot.
    const baseDir = resolveBaseDirFromRecord("project", "cursor", "/proj", homedir);
    expect(baseDir).toBe("/proj");
    expect(baseDir).not.toContain(join(".cursor", "plugins", "local"));
  });

  it("resolves user scope to the tool's user-scope plugins dir", () => {
    const baseDir = resolveBaseDirFromRecord("user", "cursor", "/proj", homedir);
    expect(baseDir).toBe(join(HOME, ".cursor", "plugins", "local"));
  });

  // A "user" scope the tool's current profile cannot explain must refuse to guess rather
  // than quietly resolve under projectRoot; claude declares no user-scope directory at all.
  it("throws, rather than falling back to projectRoot, when the tool declares no user-scope directory", () => {
    expect(() => resolveBaseDirFromRecord("user", "claude", "/proj", homedir)).toThrow(
      UnresolvableUserScopeError
    );
  });
});
