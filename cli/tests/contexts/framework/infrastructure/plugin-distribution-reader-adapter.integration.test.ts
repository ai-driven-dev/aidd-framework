import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginDistributionReaderAdapter } from "../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import type {
  PluginComponentFile,
  PluginDistribution,
} from "../../../../src/contexts/translate/domain/plugin-distribution.js";
// Side-effect imports: the adapter reads each tool's declared manifest locations off the
// registry, so an unregistered profile is a format it cannot recognise.
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import {
  InvalidPluginManifestError,
  InvalidPluginNameError,
  InvalidPluginVersionError,
} from "../../../../src/kernel/errors.js";
import { FileAdapter } from "../../../../src/runtime/filesystem/file-adapter.js";
import { HasherAdapter } from "../../../../src/runtime/filesystem/hasher-adapter.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/plugins");
const IN_MEMORY_ROOT = "/plugins/in-memory";
const IN_MEMORY_MANIFEST = ".claude-plugin/plugin.json";

function makeAdapter(): PluginDistributionReaderAdapter {
  return new PluginDistributionReaderAdapter(new FileAdapter(new HasherAdapter()));
}

function readInMemory(
  manifestText: string,
  files: Record<string, string> = {}
): Promise<PluginDistribution> {
  const seed: Record<string, string> = {
    [`${IN_MEMORY_ROOT}/${IN_MEMORY_MANIFEST}`]: manifestText,
  };
  for (const [relativePath, content] of Object.entries(files)) {
    seed[`${IN_MEMORY_ROOT}/${relativePath}`] = content;
  }
  return new PluginDistributionReaderAdapter(new InMemoryFileAdapter(seed)).read(IN_MEMORY_ROOT);
}

function readManifest(manifest: Record<string, unknown>): Promise<PluginDistribution> {
  return readInMemory(JSON.stringify(manifest));
}

function byPath(a: PluginComponentFile, b: PluginComponentFile): number {
  return a.relativePath.localeCompare(b.relativePath);
}

describe("PluginDistributionReaderAdapter", () => {
  describe("claude-format fixture", () => {
    it("detects claude format", async () => {
      const adapter = makeAdapter();
      const dist = await adapter.read(join(FIXTURE_DIR, "claude-format/sample-plugin"));
      expect(dist.format).toBe("claude");
    });

    it("includes all hooks/ files including companion scripts", async () => {
      const adapter = makeAdapter();
      const dist = await adapter.read(join(FIXTURE_DIR, "claude-format/sample-plugin"));
      const paths = dist.files.map((f) => f.relativePath);
      expect(paths).toContain("hooks/hooks.json");
      expect(paths).toContain("hooks/update_memory.js");
    });

    it("parses manifest fields", async () => {
      const adapter = makeAdapter();
      const dist = await adapter.read(join(FIXTURE_DIR, "claude-format/sample-plugin"));
      expect(dist.manifest.name).toBe("sample-plugin");
      expect(dist.manifest.version).toBe("1.0.0");
    });

    it("collects component files", async () => {
      const adapter = makeAdapter();
      const dist = await adapter.read(join(FIXTURE_DIR, "claude-format/sample-plugin"));
      expect(dist.files.length).toBeGreaterThan(0);
    });

    it("categorizes skills correctly", async () => {
      const adapter = makeAdapter();
      const dist = await adapter.read(join(FIXTURE_DIR, "claude-format/sample-plugin"));
      expect(dist.components.skills.length).toBe(1);
      expect(dist.components.skills[0].relativePath).toBe("skills/hello/SKILL.md");
    });

    it("categorizes commands correctly", async () => {
      const adapter = makeAdapter();
      const dist = await adapter.read(join(FIXTURE_DIR, "claude-format/sample-plugin"));
      expect(dist.components.commands.length).toBe(1);
      expect(dist.components.commands[0].relativePath).toBe("commands/greet.md");
    });

    it("categorizes agents correctly", async () => {
      const adapter = makeAdapter();
      const dist = await adapter.read(join(FIXTURE_DIR, "claude-format/sample-plugin"));
      expect(dist.components.agents.length).toBe(1);
      expect(dist.components.agents[0].relativePath).toBe("agents/reviewer.md");
    });

    it("reads file content", async () => {
      const adapter = makeAdapter();
      const dist = await adapter.read(join(FIXTURE_DIR, "claude-format/sample-plugin"));
      const skill = dist.components.skills[0];
      expect(skill.content).toContain("Hello from sample-plugin skill.");
    });

    it("includes the plugin manifest in files for native installation", async () => {
      const adapter = makeAdapter();
      const dist = await adapter.read(join(FIXTURE_DIR, "claude-format/sample-plugin"));
      const paths = dist.files.map((f) => f.relativePath);
      expect(paths).toContain(".claude-plugin/plugin.json");
    });
  });

  describe("cursor-format fixture", () => {
    it("detects cursor format", async () => {
      const adapter = makeAdapter();
      const dist = await adapter.read(join(FIXTURE_DIR, "cursor-format/sample-plugin"));
      expect(dist.format).toBe("cursor");
    });
  });

  describe("codex-format fixture", () => {
    it("detects codex format", async () => {
      const adapter = makeAdapter();
      const dist = await adapter.read(join(FIXTURE_DIR, "codex-format/sample-plugin"));
      expect(dist.format).toBe("codex");
    });
  });

  describe("copilot-format fixture", () => {
    it("detects copilot format", async () => {
      const adapter = makeAdapter();
      const dist = await adapter.read(join(FIXTURE_DIR, "copilot-format/sample-plugin"));
      expect(dist.format).toBe("copilot");
    });
  });

  describe("broken-plugin fixture", () => {
    it("throws InvalidPluginNameError for invalid plugin name", async () => {
      const adapter = makeAdapter();
      await expect(adapter.read(join(FIXTURE_DIR, "broken-plugin"))).rejects.toThrow(
        InvalidPluginNameError
      );
    });
  });

  describe("a directory two tools could claim", () => {
    // copilot accepts a bare root `plugin.json` and is declared before codex, so the probes
    // are ordered deepest-path-first: read in declaration order, codex would read as copilot.
    it("resolves to the tool whose location is the more specific one", async () => {
      const root = await mkdtemp(join(tmpdir(), "aidd-ambiguous-"));
      try {
        const manifest = JSON.stringify({ name: "sample-plugin", version: "1.0.0" });
        await mkdir(join(root, ".codex-plugin"), { recursive: true });
        await writeFile(join(root, ".codex-plugin/plugin.json"), manifest);
        await writeFile(join(root, "plugin.json"), manifest);

        const dist = await makeAdapter().read(root);

        expect(dist.format).toBe("codex");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });

  describe("a manifest carrying a strict field", () => {
    it("is read without it: strict belongs to the catalog entry, not to the plugin", async () => {
      const dir = await mkdtemp(join(tmpdir(), "aidd-plugin-strict-"));
      try {
        await mkdir(join(dir, ".claude-plugin"), { recursive: true });
        await writeFile(
          join(dir, ".claude-plugin", "plugin.json"),
          JSON.stringify({ name: "sample", version: "1.0.0", strict: true })
        );
        const dist = await makeAdapter().read(dir);
        expect(dist.manifest.strict).toBeUndefined();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe("non-existent directory", () => {
    it("throws InvalidPluginManifestError when directory has no plugin.json", async () => {
      const adapter = makeAdapter();
      await expect(adapter.read(join(FIXTURE_DIR, "nonexistent-plugin"))).rejects.toThrow(
        InvalidPluginManifestError
      );
    });

    it("names the directory it searched", async () => {
      const reader = new PluginDistributionReaderAdapter(new InMemoryFileAdapter());

      await expect(reader.read("/plugins/none")).rejects.toThrow(
        new InvalidPluginManifestError('no plugin.json found in "/plugins/none"')
      );
    });
  });

  describe("collecting a plugin's files", () => {
    const manifestText = JSON.stringify({ name: "full", version: "1.0.0" });
    const componentFiles = {
      "skills/hello/SKILL.md": "skill",
      "commands/greet.md": "command",
      "agents/reviewer.md": "agent",
      "rules/style.md": "rule",
      "hooks/hooks.json": "{}",
      ".mcp.json": "{}",
    };
    const otherFiles = {
      "README.md": "readme",
      LICENSE: "license",
      "docs/guide.md": "guide",
    };

    it("keeps every component file with its content, plus the manifest, and nothing else", async () => {
      const dist = await readInMemory(manifestText, { ...componentFiles, ...otherFiles });

      expect([...dist.files].sort(byPath)).toStrictEqual([
        { relativePath: IN_MEMORY_MANIFEST, content: manifestText },
        { relativePath: ".mcp.json", content: "{}" },
        { relativePath: "agents/reviewer.md", content: "agent" },
        { relativePath: "commands/greet.md", content: "command" },
        { relativePath: "hooks/hooks.json", content: "{}" },
        { relativePath: "rules/style.md", content: "rule" },
        { relativePath: "skills/hello/SKILL.md", content: "skill" },
      ]);
    });

    it("sorts each file under its own component kind, the manifest under none", async () => {
      const dist = await readInMemory(manifestText, componentFiles);

      expect(dist.components).toStrictEqual({
        skills: [{ relativePath: "skills/hello/SKILL.md", content: "skill" }],
        commands: [{ relativePath: "commands/greet.md", content: "command" }],
        agents: [{ relativePath: "agents/reviewer.md", content: "agent" }],
        rules: [{ relativePath: "rules/style.md", content: "rule" }],
        hooks: [{ relativePath: "hooks/hooks.json", content: "{}" }],
        mcp: [{ relativePath: ".mcp.json", content: "{}" }],
      });
    });

    it.skipIf(process.platform === "win32")(
      "reads a listing given with backslash separators as posix paths",
      async () => {
        const root = await mkdtemp(join(tmpdir(), "aidd-backslash-listing-"));
        try {
          await mkdir(join(root, ".claude-plugin"), { recursive: true });
          await writeFile(join(root, ".claude-plugin/plugin.json"), manifestText);
          await writeFile(join(root, "skills\\hello.md"), "skill");

          const dist = await makeAdapter().read(root);

          expect(dist.components.skills).toStrictEqual([
            { relativePath: "skills/hello.md", content: "skill" },
          ]);
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      }
    );
  });

  describe("the manifest's fields", () => {
    it("keeps name and version alone when nothing else is declared", async () => {
      const dist = await readManifest({ name: "full", version: "1.0.0" });

      expect(dist.manifest).toStrictEqual({ name: "full", version: "1.0.0" });
    });

    it("keeps a string description", async () => {
      const dist = await readManifest({ name: "full", version: "1.0.0", description: "A plugin" });

      expect(dist.manifest).toStrictEqual({
        name: "full",
        version: "1.0.0",
        description: "A plugin",
      });
    });

    it("drops a description that is not a string", async () => {
      const dist = await readManifest({ name: "full", version: "1.0.0", description: 42 });

      expect(dist.manifest).toStrictEqual({ name: "full", version: "1.0.0" });
    });

    it("keeps the author's name and email", async () => {
      const dist = await readManifest({
        name: "full",
        version: "1.0.0",
        author: { name: "Ann", email: "ann@example.com" },
      });

      expect(dist.manifest).toStrictEqual({
        name: "full",
        version: "1.0.0",
        author: { name: "Ann", email: "ann@example.com" },
      });
    });

    it("keeps the author's name alone when the email is not a string", async () => {
      const dist = await readManifest({
        name: "full",
        version: "1.0.0",
        author: { name: "Ann", email: 5 },
      });

      expect(dist.manifest).toStrictEqual({
        name: "full",
        version: "1.0.0",
        author: { name: "Ann" },
      });
    });

    it("drops an author whose name is not a string", async () => {
      const dist = await readManifest({
        name: "full",
        version: "1.0.0",
        author: { name: 5, email: "ann@example.com" },
      });

      expect(dist.manifest).toStrictEqual({ name: "full", version: "1.0.0" });
    });

    it("drops an author that is null", async () => {
      const dist = await readManifest({ name: "full", version: "1.0.0", author: null });

      expect(dist.manifest).toStrictEqual({ name: "full", version: "1.0.0" });
    });
  });

  describe("a manifest it refuses", () => {
    it("names invalid JSON", async () => {
      await expect(readInMemory("{ not json")).rejects.toThrow(
        new InvalidPluginManifestError("plugin.json is not valid JSON")
      );
    });

    it.each([
      ["null", "null"],
      ["a list", "[]"],
      ["a string", '"full"'],
    ])("names a top level that is %s rather than an object", async (_shape, manifestText) => {
      await expect(readInMemory(manifestText)).rejects.toThrow(
        new InvalidPluginManifestError("plugin.json must be a JSON object")
      );
    });

    it("names a missing name", async () => {
      await expect(readManifest({ version: "1.0.0" })).rejects.toThrow(
        new InvalidPluginManifestError('"name" must be a non-empty string')
      );
    });

    it("names an empty name", async () => {
      await expect(readManifest({ name: "", version: "1.0.0" })).rejects.toThrow(
        new InvalidPluginManifestError('"name" must be a non-empty string')
      );
    });

    it("names a name outside lowercase alphanumerics and hyphens", async () => {
      await expect(readManifest({ name: "Bad Name", version: "1.0.0" })).rejects.toThrow(
        new InvalidPluginNameError("Bad Name")
      );
    });

    it("names a missing version", async () => {
      await expect(readManifest({ name: "full" })).rejects.toThrow(
        new InvalidPluginManifestError('"version" must be a non-empty string')
      );
    });

    it("names an empty version", async () => {
      await expect(readManifest({ name: "full", version: "" })).rejects.toThrow(
        new InvalidPluginManifestError('"version" must be a non-empty string')
      );
    });

    it("names a version that is not semver", async () => {
      await expect(readManifest({ name: "full", version: "latest" })).rejects.toThrow(
        new InvalidPluginVersionError("latest")
      );
    });
  });
});
