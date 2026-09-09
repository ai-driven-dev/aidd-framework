import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PluginDistributionReaderAdapter } from "../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
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
} from "../../../../src/kernel/errors.js";
import { FileAdapter } from "../../../../src/runtime/filesystem/file-adapter.js";
import { HasherAdapter } from "../../../../src/runtime/filesystem/hasher-adapter.js";

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
  });
});
