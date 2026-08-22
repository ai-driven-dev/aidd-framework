import { describe, expect, it } from "vitest";
import { DoctorRegistrationUseCase } from "../../../src/application/use-cases/doctor/doctor-registration-use-case.js";
import { Manifest } from "../../../src/domain/models/manifest.js";
import { Marketplace } from "../../../src/domain/models/marketplace.js";
import type { ToolId } from "../../../src/domain/models/tool-ids.js";
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/copilot.js";
import "../../../src/domain/tools/ai/cursor.js";
import { InMemoryFileAdapter } from "../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryMarketplaceRegistry } from "../../helpers/ports/in-memory-marketplace-registry.js";

const PROJECT_ROOT = "/project";
const LOCAL_SETTINGS = `${PROJECT_ROOT}/.claude/settings.local.json`;

async function issuesFor(registered: string[] | null, toolId: ToolId = "claude") {
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
  return new DoctorRegistrationUseCase(fs, registry).execute({
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
