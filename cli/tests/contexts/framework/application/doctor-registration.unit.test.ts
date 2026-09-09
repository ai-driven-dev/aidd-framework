import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../src/contexts/distribution/domain/marketplace.js";
import { DoctorRegistrationUseCase } from "../../../../src/contexts/framework/application/doctor/doctor-registration-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import type { AiToolId, ToolId } from "../../../../src/kernel/tool.js";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import type {
  HostPluginRegistryReader,
  HostPluginRegistryReading,
} from "../../../../src/contexts/tools/domain/ports/host-plugin-registry-reader.js";
import { FakeHostPluginRegistryReader } from "../../../helpers/ports/fake-host-plugin-registry-reader.js";
import { FakeNativePluginActivator } from "../../../helpers/ports/fake-native-plugin-activator.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/project";
const LOCAL_SETTINGS = `${PROJECT_ROOT}/.claude/settings.local.json`;

async function issuesFor(
  registered: string[] | null,
  toolId: ToolId = "claude",
  toolInstalled = true
) {
  const fs = new InMemoryFileAdapter();
  if (registered !== null) {
    const entries = Object.fromEntries(registered.map((name) => [name, { source: {} }]));
    await fs.writeFile(LOCAL_SETTINGS, JSON.stringify({ extraKnownMarketplaces: entries }));
  }
  const registry = new InMemoryMarketplaceRegistry();
  await registry.save(
    PROJECT_ROOT,
    Marketplace.create({
      name: "aidd-framework",
      source: { kind: "local", path: "/src" },
      scope: "project",
      addedAt: "2026-01-01T00:00:00Z",
    })
  );
  const manifest = Manifest.create();
  manifest.addTool(toolId, "test", []);
  const activators = new Map([
    ["claude", new FakeNativePluginActivator({ available: toolInstalled, enablesPlugins: false })],
  ]);
  return new DoctorRegistrationUseCase(
    fs,
    registry,
    activators,
    new Map(),
    new Map(),
    () => "/user-cache",
    { get: () => "1.0.0" }
  ).execute({
    manifest,
    projectRoot: PROJECT_ROOT,
    allowedIds: null,
  });
}

describe("DoctorRegistrationUseCase", () => {
  it("says nothing when the tool still declares the marketplace", async () => {
    expect(await issuesFor(["aidd-framework"])).toEqual([]);
  });

  it("reports the marketplace the file no longer declares", async () => {
    const issues = await issuesFor([]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("aidd-framework");
    expect(issues[0].fix).toContain(".claude/settings.local.json");
  });

  it("reports it when the whole file is gone — nothing else would notice", async () => {
    const issues = await issuesFor(null);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  // The registration is written by the tool itself, so it cannot exist while the tool does not:
  // reporting it missing would be reporting that something uninstalled is unconfigured.
  it("says nothing about a tool whose binary is out of reach", async () => {
    expect(await issuesFor(null, "claude", false)).toEqual([]);
  });

  it("stays silent for a tool that keeps its registrations in a tracked file", async () => {
    expect(await issuesFor(null, "cursor")).toEqual([]);
  });

  // Copilot declares no place at all rather than a path, and a guard rejecting only `undefined`
  // lets `null` reach `join(root, null)`, which throws and takes `plugin doctor` down.
  it("stays silent, and does not throw, for a tool that declares no place at all", async () => {
    await expect(issuesFor(null, "copilot")).resolves.toEqual([]);
  });
});

const REF = "aidd-context@aidd-framework";
const REGISTRY_LOCATION = "/home/dev/.claude/plugins/installed_plugins.json";

function manifestWithNativeRegistrations(
  pluginRefs: string[],
  marketplaces: { alias: string; hostName: string }[] = [
    { alias: "aidd-framework", hostName: "aidd-framework" },
  ]
): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);
  manifest.setNativeRegistrations("claude", { binary: "claude", marketplaces, pluginRefs });
  return manifest;
}

function manifestWithPlugin(marketplace?: string): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);
  manifest.addPlugin(
    "claude",
    InstalledPlugin.fromMetadata(
      marketplace === undefined ? "hand-copied" : "aidd-context",
      "1.0.0",
      { kind: "github", repo: "ai-driven-dev/framework" },
      true,
      "user",
      marketplace
    )
  );
  return manifest;
}

async function nativeIssuesFor(
  manifest: Manifest,
  reading: HostPluginRegistryReading | "unreachable"
) {
  const fs = new InMemoryFileAdapter();
  const registry = new InMemoryMarketplaceRegistry();
  const activators = new Map([
    ["claude", new FakeNativePluginActivator({ available: true, enablesPlugins: true })],
  ]);
  const hostRegistries = new Map<AiToolId, HostPluginRegistryReader>();
  if (reading !== "unreachable") {
    hostRegistries.set("claude", new FakeHostPluginRegistryReader(reading));
  }
  return new DoctorRegistrationUseCase(
    fs,
    registry,
    activators,
    hostRegistries,
    new Map(),
    () => "/user-cache",
    { get: () => "1.0.0" }
  ).execute({
    manifest,
    projectRoot: PROJECT_ROOT,
    allowedIds: null,
  });
}

describe("DoctorRegistrationUseCase — native registrations against the host's own registry", () => {
  it("says nothing when the registry carries the expected ref, enabled", async () => {
    const issues = await nativeIssuesFor(manifestWithNativeRegistrations([REF]), {
      location: REGISTRY_LOCATION,
      refs: new Map([[REF, { enabled: true }]]),
    });

    expect(issues).toEqual([]);
  });

  it("reports an error naming the ref and `aidd sync` when the registry lacks it", async () => {
    const issues = await nativeIssuesFor(manifestWithNativeRegistrations([REF]), {
      location: REGISTRY_LOCATION,
      refs: new Map(),
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain(REF);
    expect(issues[0].message).toContain(REGISTRY_LOCATION);
    expect(issues[0].fix).toContain("aidd sync");
  });

  it("reports an error naming `aidd framework install --tool claude` when the registry disabled it", async () => {
    const issues = await nativeIssuesFor(manifestWithNativeRegistrations([REF]), {
      location: REGISTRY_LOCATION,
      refs: new Map([[REF, { enabled: false }]]),
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain(REF);
    expect(issues[0].message).toContain("disabled");
    expect(issues[0].fix).toContain("aidd framework install --tool claude");
  });

  it("reports an info line, never an error, when nothing here can read the registry", async () => {
    const issues = await nativeIssuesFor(manifestWithNativeRegistrations([REF]), "unreachable");

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("info");
  });

  it("reports an info line when the registry file exists but could not be read", async () => {
    const issues = await nativeIssuesFor(manifestWithNativeRegistrations([REF]), {
      location: REGISTRY_LOCATION,
      unreadable: "ENOENT",
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("info");
    expect(issues[0].message).toContain("ENOENT");
  });

  // `nativeRegistrations.marketplaces` names a marketplace the host registered with no plugin
  // behind it, and nothing here can be asked about one alone, so this stays silent.
  it("says nothing for a registered marketplace with no plugin ref to check", async () => {
    const issues = await nativeIssuesFor(
      manifestWithNativeRegistrations(
        [],
        [{ alias: "aidd-framework", hostName: "aidd-framework" }]
      ),
      {
        location: REGISTRY_LOCATION,
        refs: new Map(),
      }
    );

    expect(issues).toEqual([]);
  });

  it("falls back to the manifest's own plugins when nativeRegistrations was never recorded", async () => {
    const issues = await nativeIssuesFor(manifestWithPlugin("aidd-framework"), {
      location: REGISTRY_LOCATION,
      refs: new Map(),
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain(REF);
  });

  it("is unanswerable, not an error, for a fallback plugin recording no marketplace", async () => {
    const issues = await nativeIssuesFor(manifestWithPlugin(undefined), {
      location: REGISTRY_LOCATION,
      refs: new Map(),
    });

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("info");
  });
});
