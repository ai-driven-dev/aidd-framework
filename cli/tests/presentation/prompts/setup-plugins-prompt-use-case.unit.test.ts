import { describe, expect, it, vi } from "vitest";
import type {
  ResolveMarketplace,
  ResolveMarketplaceOptions,
  ResolveMarketplaceResult,
} from "../../../src/contexts/distribution/application/resolve-marketplace-use-case.js";
import type { PluginCatalogEntry } from "../../../src/contexts/distribution/domain/catalog.js";
import { Marketplace } from "../../../src/contexts/distribution/domain/marketplace.js";
import type {
  PluginInstallFromMarketplace,
  PluginInstallFromMarketplaceOptions,
  PluginInstallFromMarketplaceResult,
} from "../../../src/contexts/framework/application/plugin/plugin-install-from-marketplace-use-case.js";
import type {
  PluginPick,
  PluginPickOptions,
  PluginPickResult,
} from "../../../src/presentation/prompts/plugin-pick-use-case.js";
import { SetupPluginsPromptUseCase } from "../../../src/presentation/prompts/setup-plugins-prompt-use-case.js";
import { InMemoryMarketplaceRegistry } from "../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/test-project";

function marketplace(name: string): Marketplace {
  return Marketplace.create({
    name,
    source: { kind: "local", path: `/${name}` },
    scope: "project",
    addedAt: "2026-04-29T10:00:00.000Z",
  });
}

function entry(name: string, recommended: boolean): PluginCatalogEntry {
  return {
    name,
    source: { kind: "local", path: `/plugins/${name}` },
    version: "1.0.0",
    recommended,
    strict: false,
  };
}

class RecordingPluginPick implements PluginPick {
  readonly calls: PluginPickOptions[] = [];

  constructor(private readonly installed: readonly string[]) {}

  async execute(options: PluginPickOptions): Promise<PluginPickResult> {
    this.calls.push(options);
    return { marketplace: marketplace("local"), installed: this.installed };
  }
}

class RecordingInstaller implements PluginInstallFromMarketplace {
  readonly calls: PluginInstallFromMarketplaceOptions[] = [];

  async execute(
    options: PluginInstallFromMarketplaceOptions
  ): Promise<PluginInstallFromMarketplaceResult> {
    this.calls.push(options);
    return { marketplace: marketplace("local"), entry: entry(options.pluginName, false) };
  }
}

class SeededResolveMarketplace implements ResolveMarketplace {
  constructor(private readonly catalogs: ReadonlyMap<string, readonly PluginCatalogEntry[]>) {}

  async execute(options: ResolveMarketplaceOptions): Promise<ResolveMarketplaceResult> {
    const plugins = this.catalogs.get(options.marketplace.name);
    return {
      marketplace: options.marketplace,
      localPath: `/cache/${options.marketplace.name}`,
      catalog: plugins === undefined ? null : { plugins },
    };
  }
}

async function build(
  catalogs: ReadonlyMap<string, readonly PluginCatalogEntry[]> = new Map(),
  installedByPick: readonly string[] = []
) {
  const registry = new InMemoryMarketplaceRegistry();
  for (const name of catalogs.keys()) await registry.save(PROJECT_ROOT, marketplace(name));
  const pick = new RecordingPluginPick(installedByPick);
  const installer = new RecordingInstaller();
  const useCase = new SetupPluginsPromptUseCase(
    pick,
    installer,
    registry,
    new SeededResolveMarketplace(catalogs)
  );
  return { useCase, pick, installer, registry };
}

const ONE_MARKETPLACE = new Map([
  ["local", [entry("aidd-context", true), entry("aidd-dev", true), entry("aidd-ui", false)]],
]);

describe("SetupPluginsPromptUseCase — the mode decides what is installed", () => {
  it("installs nothing and asks nothing when no plugins were wanted", async () => {
    const { useCase, pick, installer } = await build(ONE_MARKETPLACE);

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      mode: "none",
      pluginNames: ["aidd-dev"],
      interactive: true,
    });

    expect(result).toEqual({ installed: [] });
    expect(pick.calls).toEqual([]);
    expect(installer.calls).toEqual([]);
  });

  it("installs exactly the plugins named, without reading a catalog", async () => {
    const { useCase, installer } = await build();

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      mode: "named",
      pluginNames: ["aidd-dev", "aidd-pm"],
      interactive: false,
    });

    expect(result).toEqual({ installed: ["aidd-dev", "aidd-pm"] });
    expect(installer.calls.map((call) => call.pluginName)).toEqual(["aidd-dev", "aidd-pm"]);
  });

  it("installs only the plugins a catalog recommends", async () => {
    const { useCase, installer } = await build(ONE_MARKETPLACE);

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      mode: "recommended",
      pluginNames: [],
      interactive: false,
    });

    expect(result).toEqual({ installed: ["aidd-context", "aidd-dev"] });
    expect(installer.calls.map((call) => call.pluginName)).toEqual(["aidd-context", "aidd-dev"]);
  });

  it("installs every plugin a catalog carries, recommended or not", async () => {
    const { useCase } = await build(ONE_MARKETPLACE);

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      mode: "all",
      pluginNames: [],
      interactive: false,
    });

    expect(result).toEqual({ installed: ["aidd-context", "aidd-dev", "aidd-ui"] });
  });

  it("gathers plugins from every registered marketplace, in registration order", async () => {
    const { useCase } = await build(
      new Map([
        ["first", [entry("aidd-context", true)]],
        ["second", [entry("aidd-dev", true)]],
      ])
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      mode: "all",
      pluginNames: [],
      interactive: false,
    });

    expect(result).toEqual({ installed: ["aidd-context", "aidd-dev"] });
  });

  it("skips a marketplace whose catalog could not be read, keeping the rest", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, marketplace("empty"));
    await registry.save(PROJECT_ROOT, marketplace("local"));
    const installer = new RecordingInstaller();
    const useCase = new SetupPluginsPromptUseCase(
      new RecordingPluginPick([]),
      installer,
      registry,
      new SeededResolveMarketplace(new Map([["local", [entry("aidd-dev", true)]]]))
    );

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      mode: "all",
      pluginNames: [],
      interactive: false,
    });

    expect(result).toEqual({ installed: ["aidd-dev"] });
  });
});

describe("SetupPluginsPromptUseCase — what each install is asked for", () => {
  it("installs into every tool, replacing what is there and choosing its marketplace itself", async () => {
    const { useCase, installer } = await build();

    await useCase.execute({
      projectRoot: PROJECT_ROOT,
      mode: "named",
      pluginNames: ["aidd-dev"],
      interactive: true,
    });

    expect(installer.calls).toEqual([
      {
        pluginName: "aidd-dev",
        toolIds: "all",
        projectRoot: PROJECT_ROOT,
        interactive: true,
        autoSelect: true,
        replace: true,
      },
    ]);
  });

  it("carries a non-interactive run's own flag into the install it drives", async () => {
    const { useCase, installer } = await build();

    await useCase.execute({
      projectRoot: PROJECT_ROOT,
      mode: "named",
      pluginNames: ["aidd-dev"],
      interactive: false,
    });

    expect(installer.calls[0]?.interactive).toBe(false);
  });
});

describe("SetupPluginsPromptUseCase — the interactive pick", () => {
  it("hands the pick every tool, and reports back what it installed", async () => {
    const { useCase, pick } = await build(ONE_MARKETPLACE, ["aidd-dev", "aidd-pm"]);

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      mode: "interactive",
      pluginNames: [],
      interactive: true,
    });

    expect(result).toEqual({ installed: ["aidd-dev", "aidd-pm"] });
    expect(pick.calls).toEqual([{ toolIds: "all", projectRoot: PROJECT_ROOT, interactive: true }]);
  });

  // Nothing can be picked where nobody is there to pick, and a run that cannot ask must
  // install nothing rather than fall through to a scripted mode nobody chose.
  it("installs nothing, and never reaches the pick, on a run that cannot ask", async () => {
    const { useCase, pick, installer } = await build(ONE_MARKETPLACE);

    const result = await useCase.execute({
      projectRoot: PROJECT_ROOT,
      mode: "interactive",
      pluginNames: [],
      interactive: false,
    });

    expect(result).toEqual({ installed: [] });
    expect(pick.calls).toEqual([]);
    expect(installer.calls).toEqual([]);
  });

  it("reads no catalog for an interactive pick, which reads its own", async () => {
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(PROJECT_ROOT, marketplace("local"));
    const resolve = new SeededResolveMarketplace(new Map([["local", [entry("aidd-dev", true)]]]));
    const resolveSpy = vi.spyOn(resolve, "execute");
    const useCase = new SetupPluginsPromptUseCase(
      new RecordingPluginPick([]),
      new RecordingInstaller(),
      registry,
      resolve
    );

    await useCase.execute({
      projectRoot: PROJECT_ROOT,
      mode: "interactive",
      pluginNames: [],
      interactive: true,
    });

    expect(resolveSpy).not.toHaveBeenCalled();
  });
});
