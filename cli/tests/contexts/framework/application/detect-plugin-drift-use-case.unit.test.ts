import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { describe, expect, it } from "vitest";
import { DetectPluginDriftUseCase } from "../../../../src/contexts/framework/application/shared/detect-plugin-drift-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { FileHash } from "../../../../src/kernel/file.js";
import type { FileReader } from "../../../../src/kernel/ports/file-reader.js";

const HASH_A = "abc123abc123abc123abc123abc123ab";
const HASH_B = "def456def456def456def456def456de";

function cursorManifestWithFiles(files: Record<string, string>): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("cursor", "1.0.0", []);
  manifest.addPlugin(
    "cursor",
    InstalledPlugin.fromJSON({
      name: "aidd-test",
      source: { kind: "local", path: "/some/path" },
      version: "1.0.0",
      strict: false,
      files,
    })
  );
  return manifest;
}

function makeFs(missing: Set<string>): FileReader {
  return {
    fileExists: async (p: string) => ![...missing].some((m) => p.endsWith(m)),
    isExecutable: async () => false,
    // Present files always match their own manifest hash: this fixture is about which
    // files are missing, not about hash mismatches, which the other unit tests cover.
    readFileHash: async (p: string) => new FileHash(p.endsWith("two.md") ? HASH_B : HASH_A),
    readFile: async () => "",
    listDirectory: async () => [],
    listFilesRecursive: async () => [],
  };
}

describe("DetectPluginDriftUseCase — user-scope tool never installed on this machine", () => {
  it("collapses a plugin whose every tracked file is missing into one not-installed entry", async () => {
    const files = { "a/one.md": HASH_A, "a/two.md": HASH_B };
    const manifest = cursorManifestWithFiles(files);
    const fs = makeFs(new Set(["one.md", "two.md"]));
    const useCase = new DetectPluginDriftUseCase(fs);

    const drifts = await useCase.execute({ manifest, projectRoot: "/proj", toolIds: ["cursor"] });

    expect(drifts).toHaveLength(1);
    expect(drifts[0].notInstalledOnMachine).toBe(true);
    expect(drifts[0].files).toHaveLength(0);
  });

  it("still reports per-file drift when only one of several tracked files is missing", async () => {
    const files = { "a/one.md": HASH_A, "a/two.md": HASH_B };
    const manifest = cursorManifestWithFiles(files);
    const fs = makeFs(new Set(["one.md"]));
    const useCase = new DetectPluginDriftUseCase(fs);

    const drifts = await useCase.execute({ manifest, projectRoot: "/proj", toolIds: ["cursor"] });

    expect(drifts).toHaveLength(1);
    expect(drifts[0].notInstalledOnMachine).toBe(false);
    expect(drifts[0].files).toHaveLength(1);
    expect(drifts[0].files[0]).toEqual({ relativePath: "a/one.md", kind: "missing" });
  });

  it("does not collapse an all-missing plugin for a project-scope tool", async () => {
    const manifest = Manifest.create();
    manifest.addTool("claude", "1.0.0", []);
    manifest.addPlugin(
      "claude",
      InstalledPlugin.fromJSON({
        name: "aidd-test",
        source: { kind: "local", path: "/some/path" },
        version: "1.0.0",
        strict: false,
        files: { "a/one.md": HASH_A, "a/two.md": HASH_B },
      })
    );
    const fs = makeFs(new Set(["one.md", "two.md"]));
    const useCase = new DetectPluginDriftUseCase(fs);

    const drifts = await useCase.execute({ manifest, projectRoot: "/proj", toolIds: ["claude"] });

    expect(drifts).toHaveLength(1);
    expect(drifts[0].notInstalledOnMachine).toBe(false);
    expect(drifts[0].files).toHaveLength(2);
  });
});
