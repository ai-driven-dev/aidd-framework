import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UninstallMcpExclusionUseCase } from "../../../../../src/contexts/framework/application/uninstall/uninstall-mcp-exclusion-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import type { FileHash } from "../../../../../src/kernel/file.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/test-project";
const MCP = ".mcp.json";
const SECTION = "mcpServers";
const hasher = new DeterministicHasher();
const GITHUB = { command: "gh" };
const PLAYWRIGHT = { command: "npx" };
const CONTENT = JSON.stringify({ [SECTION]: { github: GITHUB, playwright: PLAYWRIGHT } });

function hashOf(value: unknown): FileHash {
  return hasher.hash(JSON.stringify(value));
}

function claudeMerging(
  content: string,
  entries: Record<string, FileHash>,
  sectionKey: string | null = SECTION
): { fs: InMemoryFileAdapter; manifest: Manifest } {
  const fs = new InMemoryFileAdapter({ [join(PROJECT_ROOT, MCP)]: content }, hasher);
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", [], [{ relativePath: MCP, sectionKey, entries }]);
  return { fs, manifest };
}

function twoServers() {
  return claudeMerging(CONTENT, { github: hashOf(GITHUB), playwright: hashOf(PLAYWRIGHT) });
}

function exclude(
  project: { fs: InMemoryFileAdapter; manifest: Manifest },
  mcpFilter: string[],
  logger = new CapturingLogger()
) {
  return new UninstallMcpExclusionUseCase(project.fs, logger).execute({
    toolId: "claude",
    manifest: project.manifest,
    projectRoot: PROJECT_ROOT,
    mcpFilter,
  });
}

describe("UninstallMcpExclusionUseCase", () => {
  it("announces the tool it strips entries from", async () => {
    const logger = new CapturingLogger();

    await exclude(twoServers(), ["github"], logger);

    expect(logger.infoMessages).toStrictEqual(["Removing MCP entries from claude..."]);
  });

  it("removes the named entries that exist and reports exactly those", async () => {
    const project = twoServers();

    const result = await exclude(project, ["github", "absent"]);

    expect(result).toStrictEqual({ toolId: "claude", fileCount: 1, deletedFiles: ["github"] });
    expect(JSON.parse(project.fs.getFile(join(PROJECT_ROOT, MCP)) ?? "")).toStrictEqual({
      [SECTION]: { playwright: PLAYWRIGHT },
    });
  });

  it("stops tracking the entries it removed", async () => {
    const project = twoServers();

    await exclude(project, ["github"]);

    expect(project.manifest.getMergeFiles("claude")).toStrictEqual([
      { relativePath: MCP, sectionKey: SECTION, entries: { playwright: hashOf(PLAYWRIGHT) } },
    ]);
  });

  it("records each removal so a later install leaves the entry out", async () => {
    const project = twoServers();

    await exclude(project, ["github"]);

    expect(project.manifest.getExcludedMcp("claude")).toStrictEqual([
      { configPath: MCP, entryKey: "github" },
    ]);
  });

  it("leaves a file byte-identical when none of the named entries is in it", async () => {
    const project = twoServers();

    const result = await exclude(project, ["absent"]);

    expect(result).toStrictEqual({ toolId: "claude", fileCount: 0, deletedFiles: [] });
    expect(project.fs.getFile(join(PROJECT_ROOT, MCP))).toBe(CONTENT);
  });

  it("leaves a file tracked without a section untouched even when it holds a named key", async () => {
    const content = JSON.stringify({ github: GITHUB });
    const project = claudeMerging(content, { github: hashOf(GITHUB) }, null);

    const result = await exclude(project, ["github"]);

    expect(result).toStrictEqual({ toolId: "claude", fileCount: 0, deletedFiles: [] });
    expect(project.fs.getFile(join(PROJECT_ROOT, MCP))).toBe(content);
  });
});
