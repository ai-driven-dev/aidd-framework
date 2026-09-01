// OpenCode uses Mode B with `mode: "flat"` and project scope. The translator routes through
// `translateFlat` which writes files at `.opencode/<section>/<plugin>/<file>` under projectRoot
// (not under a single `.opencode/plugins/<name>/` root — that shape is exclusive to native mode).
import "../../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { describe, expect, it } from "vitest";
import { ModeBFlatMaterializationTranslator } from "../../../../../src/application/use-cases/framework/translator/mode-b-flat-materialization-translator.js";
import { Manifest } from "../../../../../src/domain/models/manifest.js";
import { PluginDistribution } from "../../../../../src/domain/models/plugin-distribution.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/test-project";
const STUB_HOME = "/tmp/test-home";

function buildDist(name = "aidd-context"): PluginDistribution {
  return new PluginDistribution({
    manifest: { name, version: "1.0.0" },
    format: "claude",
    files: [
      {
        relativePath: "commands/hello.md",
        content: "---\nname: aidd:01:hello\n---\n# Hello",
      },
      { relativePath: "agents/coach.md", content: "---\nname: coach\n---\n# Coach" },
    ],
    components: {
      commands: [
        {
          relativePath: "commands/hello.md",
          content: "---\nname: aidd:01:hello\n---\n# Hello",
        },
      ],
      agents: [{ relativePath: "agents/coach.md", content: "---\nname: coach\n---\n# Coach" }],
      rules: [],
      skills: [],
      hooks: [],
      mcp: [],
    },
  });
}

describe("install opencode plugin via Mode B (integration)", () => {
  it("materializes flat plugin files under .opencode/<section>/<plugin>/ at projectRoot", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);

    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    const written = fs.listAll();
    expect(
      written.some((p) => p.startsWith(`${PROJECT_ROOT}/.opencode/commands/aidd-context/`))
    ).toBe(true);
    expect(
      written.some((p) => p.startsWith(`${PROJECT_ROOT}/.opencode/agents/aidd-context/`))
    ).toBe(true);
  });

  it("does not write any file under user home for project-scope flat tools", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);

    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    expect(fs.listAll().every((p) => !p.startsWith(STUB_HOME))).toBe(true);
  });

  it("registers plugin in manifest with files map keyed by relative path", async () => {
    const fs = new InMemoryFileAdapter();
    const hasher = new DeterministicHasher();
    const adapter = new ModeBFlatMaterializationTranslator(fs, hasher, () => STUB_HOME);
    const manifest = Manifest.create();
    manifest.addTool("opencode", "test", []);

    await adapter.addPlugin(
      buildDist(),
      "opencode",
      { kind: "local", path: "/plugin-source" },
      PROJECT_ROOT,
      manifest,
      undefined,
      "docs"
    );

    const installed = manifest.getPlugins("opencode").find((p) => p.name === "aidd-context");
    expect(installed).toBeDefined();
    expect(installed?.files.size).toBeGreaterThan(0);
  });
});
