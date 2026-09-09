import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginAddUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import type { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { PluginDistributionReaderAdapter } from "../../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

const EXTRA_PLUGIN_FIXTURE = join(
  process.cwd(),
  "tests/fixtures/plugins/claude-format/extra-plugin"
);
const PROJECT_ROOT = "/test-project";
const MCP_PLUGIN_DIR = "/plugins/mcp-plugin";
const OPENCODE_JSON = join(PROJECT_ROOT, "opencode.json");

type Deps = Awaited<ReturnType<typeof buildUnitDeps>>;

async function buildOpencodeProject(): Promise<{
  deps: Deps;
  logger: CapturingLogger;
  useCase: PluginAddUseCase;
}> {
  const deps = await buildUnitDeps(PROJECT_ROOT);
  await initAndInstall(deps, PROJECT_ROOT, "opencode");
  deps.fs.setFile(
    join(MCP_PLUGIN_DIR, ".claude-plugin/plugin.json"),
    JSON.stringify({ name: "mcp-plugin", version: "1.0.0" })
  );
  deps.fs.setFile(join(MCP_PLUGIN_DIR, "skills/demo/SKILL.md"), "# Demo skill");
  deps.fs.setFile(
    join(MCP_PLUGIN_DIR, ".mcp.json"),
    JSON.stringify({ mcpServers: { "local-tool": { command: "node", args: ["./server.js"] } } })
  );
  const logger = new CapturingLogger();
  const useCase = new PluginAddUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    new PluginDistributionReaderAdapter(deps.fs),
    deps.hasher,
    logger,
    deps.marketplaceRegistry,
    fakeEnsureBuiltMarketplace()
  );
  return { deps, logger, useCase };
}

function addLocal(useCase: PluginAddUseCase, path: string, replace?: boolean): Promise<void> {
  return useCase.execute({
    source: { kind: "local", path },
    toolIds: ["opencode"],
    projectRoot: PROJECT_ROOT,
    interactive: false,
    replace,
  });
}

function installedMcpPlugin(deps: Deps): InstalledPlugin | undefined {
  return deps.manifestRepo
    .getCurrent()
    ?.getPlugins("opencode")
    .find((p) => p.name === "mcp-plugin");
}

describe("PluginAddUseCase and opencode MCP servers", () => {
  it("keeps its own MCP server, without a collision, when re-added with replace", async () => {
    const { deps, logger, useCase } = await buildOpencodeProject();
    await seedFromDirectory(deps.fs, EXTRA_PLUGIN_FIXTURE, { useAbsolutePaths: true });
    await addLocal(useCase, EXTRA_PLUGIN_FIXTURE);
    await addLocal(useCase, MCP_PLUGIN_DIR);
    const firstEntries = [...(installedMcpPlugin(deps)?.mcpEntries ?? [])];

    await addLocal(useCase, MCP_PLUGIN_DIR, true);

    expect(firstEntries.map(([name]) => name)).toStrictEqual(["local-tool"]);
    expect([...(installedMcpPlugin(deps)?.mcpEntries ?? [])]).toStrictEqual(firstEntries);
    expect(logger.warnMessages).toStrictEqual([]);
  });

  it("warns for an MCP server the user already owns and records no entry for it", async () => {
    const { deps, logger, useCase } = await buildOpencodeProject();
    deps.fs.setFile(
      OPENCODE_JSON,
      JSON.stringify({ mcp: { "local-tool": { type: "local", command: ["mine"] } } })
    );

    await addLocal(useCase, MCP_PLUGIN_DIR);

    expect(logger.warnMessages).toStrictEqual([
      'Plugin "mcp-plugin": mcp skipped for opencode — local-tool: server already exists in opencode.json (user-owned); plugin entry skipped',
    ]);
    expect([...(installedMcpPlugin(deps)?.mcpEntries ?? [])]).toStrictEqual([]);
  });
});
