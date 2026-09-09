import "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DetectPluginDriftUseCase } from "../../../../../src/contexts/framework/application/shared/detect-plugin-drift-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/proj";
const USER_PLUGINS_DIR = join(homedir(), ".cursor", "plugins", "local");
const HASHER = new DeterministicHasher();
const HASH_OF_ONE = HASHER.hash("one").value;
const HASH_OF_TWO = HASHER.hash("two").value;

function manifestWith(plugins: Record<string, Record<string, string>>): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("cursor", "1.0.0", []);
  for (const [name, files] of Object.entries(plugins)) {
    manifest.addPlugin(
      "cursor",
      InstalledPlugin.fromJSON({
        name,
        source: { kind: "local", path: "/some/path" },
        version: "1.0.0",
        strict: false,
        files,
        scope: "user",
      })
    );
  }
  return manifest;
}

describe("DetectPluginDriftUseCase", () => {
  it("narrows the report to the plugin it was asked about", async () => {
    const manifest = manifestWith({
      "aidd-one": { "aidd-one/a.md": HASH_OF_ONE },
      "aidd-two": { "aidd-two/a.md": HASH_OF_ONE },
    });
    const useCase = new DetectPluginDriftUseCase(new InMemoryFileAdapter({}, HASHER));

    const drifts = await useCase.execute({
      manifest,
      projectRoot: PROJECT_ROOT,
      toolIds: ["cursor"],
      pluginName: "aidd-two",
    });

    expect(drifts).toStrictEqual([
      { toolId: "cursor", pluginName: "aidd-two", files: [], notInstalledOnMachine: true },
    ]);
  });

  it("reports one missing and one changed file as drift, never as a plugin absent from this machine", async () => {
    const manifest = manifestWith({
      "aidd-one": { "aidd-one/gone.md": HASH_OF_ONE, "aidd-one/changed.md": HASH_OF_ONE },
    });
    const fs = new InMemoryFileAdapter(
      { [join(USER_PLUGINS_DIR, "aidd-one", "changed.md")]: "two" },
      HASHER
    );
    const useCase = new DetectPluginDriftUseCase(fs);

    const drifts = await useCase.execute({
      manifest,
      projectRoot: PROJECT_ROOT,
      toolIds: ["cursor"],
    });

    expect(HASH_OF_TWO).not.toBe(HASH_OF_ONE);
    expect(drifts).toStrictEqual([
      {
        toolId: "cursor",
        pluginName: "aidd-one",
        files: [
          { relativePath: "aidd-one/gone.md", kind: "missing" },
          { relativePath: "aidd-one/changed.md", kind: "hash-mismatch" },
        ],
        notInstalledOnMachine: false,
      },
    ]);
  });
});
