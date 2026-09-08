import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { Marketplace } from "../../../../src/contexts/distribution/domain/marketplace.js";
import { DoctorRegistrationUseCase } from "../../../../src/contexts/framework/application/doctor/doctor-registration-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { builtMarketplaceDir, userBuiltMarketplaceDir } from "../../../../src/kernel/paths.js";
import type { FileReader } from "../../../../src/kernel/ports/file-reader.js";
import type { VersionReader } from "../../../../src/kernel/ports/version-reader.js";
import { FakeHostMarketplaceRegistryReader } from "../../../helpers/ports/fake-host-marketplace-registry-reader.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";

function fakeVersion(value: string): VersionReader {
  return { get: () => value };
}

const PROJECT_ROOT = "/project";
const NAME = "probe-mkt";
const CATALOG_RELATIVE = ".claude-plugin/marketplace.json";
const REGISTRY_LOCATION = "/home/.claude/plugins/known_marketplaces.json";

/** The exact path `MarketplaceSyncSettingsUseCase`'s own guard would compare against —
 * recomputed the same way `checkMarketplaceSources` does, never a value invented here. */
function expectedBuiltDir(): string {
  return resolve(builtMarketplaceDir(PROJECT_ROOT, NAME, "claude"));
}

/** A `FileReader` whose `realpath` always throws, standing in for a built tree that was
 * never built, or was built and then deleted — the one case `checkMarketplaceSources`
 * must stay silent on rather than inventing a conflict against a path nothing resolves to. */
class UnresolvableFileReader implements FileReader {
  async readFile(): Promise<string> {
    throw new Error("not used by this test");
  }
  async listDirectory(): Promise<string[]> {
    return [];
  }
  async fileExists(): Promise<boolean> {
    return false;
  }
  async readFileHash(): Promise<never> {
    throw new Error("not used by this test");
  }
  async listFilesRecursive(): Promise<string[]> {
    return [];
  }
  async isExecutable(): Promise<boolean> {
    return false;
  }
  async realpath(): Promise<string> {
    const error = new Error("ENOENT") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }
}

interface CatalogAt {
  readonly path: string;
  readonly name?: string;
  readonly version?: string;
  readonly pluginNames?: readonly string[];
}

function catalogFile(catalog: CatalogAt): [string, string] {
  return [
    `${catalog.path}/${CATALOG_RELATIVE}`,
    JSON.stringify({
      name: catalog.name ?? NAME,
      version: catalog.version,
      plugins: (catalog.pluginNames ?? []).map((name) => ({ name })),
    }),
  ];
}

async function issuesFor(
  hostReader: FakeHostMarketplaceRegistryReader,
  options: { fs?: FileReader; requested?: CatalogAt; registered?: CatalogAt } = {}
) {
  let fs = options.fs ?? new InMemoryFileAdapter();
  if (options.fs === undefined) {
    const seed: Record<string, string> = {};
    const requested = options.requested ?? { path: expectedBuiltDir() };
    const [requestedPath, requestedContent] = catalogFile(requested);
    seed[requestedPath] = requestedContent;
    if (options.registered !== undefined) {
      const [registeredPath, registeredContent] = catalogFile(options.registered);
      seed[registeredPath] = registeredContent;
    }
    fs = new InMemoryFileAdapter(seed);
  }
  const registry = new InMemoryMarketplaceRegistry();
  await registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name: NAME,
      source: { kind: "local", path: "/source" },
      scope: "project",
      addedAt: "2026-01-01T00:00:00Z",
    })
  );
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);
  const useCase = new DoctorRegistrationUseCase(
    fs,
    registry,
    new Map(),
    new Map(),
    new Map([["claude", hostReader]]),
    () => "/user-cache",
    fakeVersion("1.0.0")
  );
  const issues = await useCase.execute({ manifest, projectRoot: PROJECT_ROOT, allowedIds: null });
  // Not filtered by `NAME` (this project's own local alias): a conflict message names
  // the catalog's own declared name, which a test deliberately diverging the two is
  // free to set to something else entirely — see "reports a conflict keyed by the
  // catalog's own declared name" below.
  return issues.filter((issue) => issue.message.includes("catalog"));
}

describe("DoctorRegistrationUseCase — marketplace source conflicts", () => {
  it("reports a conflict when a different catalog is registered under the same name", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([[NAME, "/other/src"]]),
    });

    const issues = await issuesFor(hostReader, {
      requested: { path: expectedBuiltDir(), pluginNames: ["sample-plugin"] },
      registered: { path: "/other/src", pluginNames: ["different-plugin"] },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.message).toMatch(/different catalog/);
    expect(issues[0]?.message).toMatch(/\+sample-plugin/);
    expect(issues[0]?.message).toMatch(/-different-plugin/);
    expect(issues[0]?.fix).toMatch(/claude plugin marketplace remove/);
  });

  it("does not report a conflict when only the version differs under the same name and plugin set — an upgrade, not a conflict", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([[NAME, "/other/src"]]),
    });

    const issues = await issuesFor(hostReader, {
      requested: { path: expectedBuiltDir(), version: "2.0.0", pluginNames: ["sample-plugin"] },
      registered: { path: "/other/src", version: "1.0.0", pluginNames: ["sample-plugin"] },
    });

    expect(issues).toEqual([]);
  });

  it("reports a conflict keyed by the catalog's own declared name even when this project's local alias would have missed it entirely — the alias never held the entry to begin with", async () => {
    const HOST_NAME = "upstream";
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      // Nothing at all is registered under this project's own local alias (`NAME`,
      // "probe-mkt") — only under the catalog's own declared name, `HOST_NAME`. A pass
      // that looked the conflict up by `marketplace.name` (the alias) instead of the
      // catalog's own declared name would find nothing here and stay silent.
      entries: new Map([[HOST_NAME, "/other/src"]]),
    });

    const issues = await issuesFor(hostReader, {
      requested: { path: expectedBuiltDir(), name: HOST_NAME, pluginNames: ["sample-plugin"] },
      registered: { path: "/other/src", name: HOST_NAME, pluginNames: ["different-plugin"] },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.message).toMatch(/different catalog/);
  });

  it("reports nothing when the host's registry already holds the same resolved source", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([[NAME, expectedBuiltDir()]]),
    });

    expect(await issuesFor(hostReader, { requested: { path: expectedBuiltDir() } })).toEqual([]);
  });

  it("reports nothing when the same catalog is registered from a different, resolved path — two projects sharing one build", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([[NAME, "/other-project/built/claude"]]),
    });

    const issues = await issuesFor(hostReader, {
      requested: { path: expectedBuiltDir(), version: "1.0.0", pluginNames: ["sample-plugin"] },
      registered: {
        path: "/other-project/built/claude",
        version: "1.0.0",
        pluginNames: ["sample-plugin"],
      },
    });

    expect(issues).toEqual([]);
  });

  it("reports nothing when the registered source no longer resolves to a readable catalog — a dead entry a re-add repairs", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([[NAME, "/gone"]]),
    });

    // No `registered` catalog written for "/gone" — nothing is there to read.
    expect(await issuesFor(hostReader, { requested: { path: expectedBuiltDir() } })).toEqual([]);
  });

  it("reports nothing when the host's registry cannot be read", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      unreadable: "ENOENT",
    });

    expect(await issuesFor(hostReader, { requested: { path: expectedBuiltDir() } })).toEqual([]);
  });

  it("reports nothing when this project's build was never made, or no longer resolves", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([[NAME, "/other/src"]]),
    });

    expect(await issuesFor(hostReader, { fs: new UnresolvableFileReader() })).toEqual([]);
  });

  it("reports nothing when this project's local alias differs from its catalog's own name, even when the alias coincidentally names a different registered entry", async () => {
    const CATALOG_NAME = "probe-mkt-catalog";
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([
        // Coincidence: some unrelated catalog happens to be registered under this
        // project's own local alias (`NAME`) — a fact `checkMarketplaceSources` must
        // never look up, since the host never keyed *this* project's registration by
        // that alias in the first place.
        [NAME, "/other/unrelated/src"],
        // The host's real key for this project's own catalog: its own declared name,
        // pointed at the exact tree this project built.
        [CATALOG_NAME, expectedBuiltDir()],
      ]),
    });
    const fs = new InMemoryFileAdapter({
      [`${expectedBuiltDir()}/${CATALOG_RELATIVE}`]: JSON.stringify({
        name: CATALOG_NAME,
        version: "1.0.0",
        plugins: [],
      }),
      "/other/unrelated/src/.claude-plugin/marketplace.json": JSON.stringify({
        name: "unrelated",
        version: "9.9.9",
        plugins: [],
      }),
    });

    expect(await issuesFor(hostReader, { fs })).toEqual([]);
  });

  it("reads the host registry once per marketplace, the same cadence the sync-time guard uses — not once per tool, reused across every marketplace that tool has", async () => {
    const SECOND_NAME = "probe-mkt-2";
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map(),
    });
    const fs = new InMemoryFileAdapter({
      [`${expectedBuiltDir()}/${CATALOG_RELATIVE}`]: JSON.stringify({
        name: NAME,
        plugins: [],
      }),
      [`${resolve(builtMarketplaceDir(PROJECT_ROOT, SECOND_NAME, "claude"))}/${CATALOG_RELATIVE}`]:
        JSON.stringify({ name: SECOND_NAME, plugins: [] }),
    });
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: NAME,
        source: { kind: "local", path: "/source" },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: SECOND_NAME,
        source: { kind: "local", path: "/source-2" },
        scope: "project",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const useCase = new DoctorRegistrationUseCase(
      fs,
      registry,
      new Map(),
      new Map(),
      new Map([["claude", hostReader]]),
      () => "/user-cache",
      fakeVersion("1.0.0")
    );

    await useCase.execute({ manifest, projectRoot: PROJECT_ROOT, allowedIds: null });

    expect(hostReader.reads).toBe(2);
  });
});

describe("DoctorRegistrationUseCase — user-scope marketplace source drift", () => {
  const USER_CACHE_ROOT = "/user-cache";
  const CURRENT_VERSION = "2.0.0";

  function sharedPath(version: string): string {
    return resolve(userBuiltMarketplaceDir(USER_CACHE_ROOT, version, NAME, "claude"));
  }

  async function driftIssuesFor(hostReader: FakeHostMarketplaceRegistryReader) {
    const fs = new InMemoryFileAdapter({
      [`${sharedPath(CURRENT_VERSION)}/${CATALOG_RELATIVE}`]: JSON.stringify({
        name: NAME,
        plugins: [],
      }),
    });
    const registry = new InMemoryMarketplaceRegistry();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: NAME,
        source: { kind: "local", path: "/source" },
        scope: "user",
        addedAt: "2026-01-01T00:00:00Z",
      })
    );
    const manifest = Manifest.create();
    manifest.addTool("claude", "test", []);
    const useCase = new DoctorRegistrationUseCase(
      fs,
      registry,
      new Map(),
      new Map(),
      new Map([["claude", hostReader]]),
      () => USER_CACHE_ROOT,
      fakeVersion(CURRENT_VERSION)
    );
    return useCase.execute({ manifest, projectRoot: PROJECT_ROOT, allowedIds: null });
  }

  it("warns naming both versions when the host already follows a newer aidd version than this run", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([[NAME, sharedPath("3.0.0")]]),
    });

    const issues = await driftIssuesFor(hostReader);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
    expect(issues[0]?.message).toContain("3.0.0");
    expect(issues[0]?.message).toContain(CURRENT_VERSION);
    expect(issues[0]?.fix).toContain("aidd update");
  });

  it("warns naming `aidd sync` when the host still points at this project's own pre-migration cache", async () => {
    const projectCache = resolve(builtMarketplaceDir(PROJECT_ROOT, NAME, "claude"));
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([[NAME, projectCache]]),
    });

    const issues = await driftIssuesFor(hostReader);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
    expect(issues[0]?.message).toContain(projectCache);
    expect(issues[0]?.fix).toContain("aidd sync");
  });

  it("warns naming `aidd sync` when the host still points at another project's pre-migration cache", async () => {
    const foreignProjectCache = resolve(builtMarketplaceDir("/other-project", NAME, "claude"));
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([[NAME, foreignProjectCache]]),
    });

    const issues = await driftIssuesFor(hostReader);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe("warning");
    expect(issues[0]?.message).toContain(foreignProjectCache);
    // Never the wording pinned for *this* project's own cache above — a project
    // reading its own pre-migration path back would be told the wrong story.
    expect(issues[0]?.message).not.toContain("this project's own pre-migration cache");
    expect(issues[0]?.message).toContain("another project's pre-migration cache");
    expect(issues[0]?.fix).toContain("aidd sync");
  });

  it("says nothing when the host already follows this exact shared version", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([[NAME, sharedPath(CURRENT_VERSION)]]),
    });

    expect(await driftIssuesFor(hostReader)).toEqual([]);
  });

  it("says nothing when this project's own version is ahead of the host's — the host follows on the next sync", async () => {
    const hostReader = new FakeHostMarketplaceRegistryReader({
      location: REGISTRY_LOCATION,
      entries: new Map([[NAME, sharedPath("1.0.0")]]),
    });

    expect(await driftIssuesFor(hostReader)).toEqual([]);
  });
});
