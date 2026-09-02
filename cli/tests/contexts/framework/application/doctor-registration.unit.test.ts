import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../../src/contexts/distribution/domain/marketplace.js";
import { DoctorRegistrationUseCase } from "../../../../src/contexts/framework/application/doctor/doctor-registration-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import type { ToolId } from "../../../../src/kernel/tool.js";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
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
  return new DoctorRegistrationUseCase(fs, registry, activators).execute({
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

  // The registration is written by the tool itself, so it cannot exist while the tool
  // does not. Reporting it missing then would be reporting that something uninstalled
  // is unconfigured.
  it("says nothing about a tool whose binary is out of reach", async () => {
    expect(await issuesFor(null, "claude", false)).toEqual([]);
  });

  it("stays silent for a tool that keeps its registrations in a tracked file", async () => {
    expect(await issuesFor(null, "cursor")).toEqual([]);
  });

  // Copilot declares no place at all rather than a path, and `null` once slipped past
  // a guard that only rejected `undefined` — straight into `join(root, null)`, which
  // threw and took `plugin doctor` down with it. Caught by the smoke suite.
  it("stays silent, and does not throw, for a tool that declares no place at all", async () => {
    await expect(issuesFor(null, "copilot")).resolves.toEqual([]);
  });
});
