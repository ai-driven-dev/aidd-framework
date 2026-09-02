import "../../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ModeBFlatMaterializationTranslator } from "../../../../../../src/contexts/framework/application/framework/translator/mode-b-flat-materialization-translator.js";
import { Manifest } from "../../../../../../src/contexts/framework/domain/manifest.js";
import { PluginDistribution } from "../../../../../../src/contexts/translate/domain/plugin-distribution.js";
import { DeterministicHasher } from "../../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";

const STUB_HOME = "/tmp/test-home";
const PROJECT_ROOT = "/test-project";

function buildDist(name = "aidd-context"): PluginDistribution {
  return new PluginDistribution({
    manifest: { name, version: "1.0.0" },
    format: "claude",
    files: [
      { relativePath: "commands/hello.md", content: "---\nname: aidd:01:hello\n---\n# Hello" },
    ],
    components: {
      commands: [
        { relativePath: "commands/hello.md", content: "---\nname: aidd:01:hello\n---\n# Hello" },
      ],
      agents: [],
      rules: [],
      skills: [],
      hooks: [],
      mcp: [],
    },
  });
}

describe("install cursor plugin via Mode B (integration)", () => {
  it("materializes files at user-scope path under stubbed homedir", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);

    await adapter.addPlugin(
      buildDist("aidd-context"),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    const expectedBase = join(STUB_HOME, ".cursor", "plugins", "local");
    const writtenPaths = fs.listAll();
    expect(writtenPaths.some((p) => p.startsWith(expectedBase))).toBe(true);
  });

  it("does not write any file under projectRoot", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);

    await adapter.addPlugin(
      buildDist("aidd-context"),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    expect(fs.listAll().every((p) => !p.startsWith(PROJECT_ROOT))).toBe(true);
  });

  it("stores base-relative keys in Plugin.files (not absolute paths)", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);

    await adapter.addPlugin(
      buildDist("aidd-context"),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    const plugins = manifest.getPlugins("cursor");
    const installed = plugins.find((p) => p.name === "aidd-context");
    expect(installed).toBeDefined();
    expect(installed?.files.size).toBeGreaterThan(0);
    for (const key of installed?.files.keys() ?? []) {
      expect(key).not.toMatch(/^\/|^~\//);
      expect(key.startsWith("aidd-context/")).toBe(true);
    }
  });

  it("join(resolvedBase, key) matches the written absolute path", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("cursor", "test", []);

    await adapter.addPlugin(
      buildDist("aidd-context"),
      "cursor",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    const plugins = manifest.getPlugins("cursor");
    const installed = plugins.find((p) => p.name === "aidd-context");
    const resolvedBase = join(STUB_HOME, ".cursor", "plugins", "local");
    for (const key of installed?.files.keys() ?? []) {
      const expectedAbsPath = join(resolvedBase, key);
      expect(fs.has(expectedAbsPath)).toBe(true);
    }
  });
});
