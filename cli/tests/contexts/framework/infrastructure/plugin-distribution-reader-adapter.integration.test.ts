import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginDistributionReaderAdapter } from "../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { FileAdapter } from "../../../../src/infrastructure/adapters/file-adapter.js";
import { HasherAdapter } from "../../../../src/infrastructure/adapters/hasher-adapter.js";
import {
  InvalidPluginManifestError,
  InvalidPluginNameError,
} from "../../../../src/kernel/errors.js";

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/plugins");

function makeAdapter(): PluginDistributionReaderAdapter {
  return new PluginDistributionReaderAdapter(new FileAdapter(new HasherAdapter()));
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

  describe("non-existent directory", () => {
    it("throws InvalidPluginManifestError when directory has no plugin.json", async () => {
      const adapter = makeAdapter();
      await expect(adapter.read(join(FIXTURE_DIR, "nonexistent-plugin"))).rejects.toThrow(
        InvalidPluginManifestError
      );
    });
  });
});
