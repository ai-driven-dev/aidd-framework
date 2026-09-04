import { describe, expect, it } from "vitest";
import { opencode } from "../../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { OpencodeDualConfigError } from "../../../../../src/kernel/errors.js";
import { FileHash } from "../../../../../src/kernel/file.js";
import type { FileReader } from "../../../../../src/kernel/ports/file-reader.js";

function makeFs(existingPaths: string[]): FileReader {
  return {
    fileExists: async (path: string) => existingPaths.some((p) => path.endsWith(p)),
    isExecutable: async () => false,
    readFile: async () => "",
    readFileHash: async () => new FileHash("00000000000000000000000000000000"),
    listDirectory: async () => [],
    listFilesRecursive: async () => [],
  };
}

describe("opencode", () => {
  describe("capabilities.agents.buildInstallPath()", () => {
    it("builds path under .opencode/agents/", () => {
      const path = opencode.capabilities.agents.buildInstallPath("code-reviewer.md");
      expect(path).toBe(".opencode/agents/code-reviewer.md");
    });

    it("strips .opencode.md tool suffix", () => {
      const path = opencode.capabilities.agents.buildInstallPath("alexia.opencode.md");
      expect(path).toBe(".opencode/agents/alexia.md");
    });
  });

  describe("capabilities.agents.convertFrontmatter()", () => {
    it("adds mode subagent to OpenCode agent frontmatter", () => {
      const fm = { name: "alexia", description: "Act like the user" };
      const result = opencode.capabilities.agents.convertFrontmatter(fm);
      expect(result).toEqual({ description: "Act like the user", mode: "subagent" });
    });
  });

  describe("capabilities.commands.buildInstallPath()", () => {
    it("builds AIDD-namespaced path under .opencode/commands/aidd/<phase>/", () => {
      const path = opencode.capabilities.commands?.buildInstallPath("04_code/implement.md");
      expect(path).toBe(".opencode/commands/aidd/04/implement.md");
    });

    it("falls back to aidd/<baseName> for top-level files without a phase directory", () => {
      const path = opencode.capabilities.commands?.buildInstallPath("implement.md");
      expect(path).toBe(".opencode/commands/aidd/implement.md");
    });
  });

  describe("capabilities.commands.convertFrontmatter()", () => {
    it("emits name prefixed with aidd:<phase>: and description", () => {
      const fm = { name: "implement", description: "Implement a plan", model: "gpt-4o" };
      const result = opencode.capabilities.commands?.convertFrontmatter(fm, "04_code/implement.md");
      expect(result).toEqual({ name: "aidd:04:implement", description: "Implement a plan" });
    });

    it("emits bare name when relativeFileName has no leading-digit phase", () => {
      const fm = { name: "implement", description: "Implement a plan" };
      const result = opencode.capabilities.commands?.convertFrontmatter(fm, "implement.md");
      expect(result).toEqual({ name: "implement", description: "Implement a plan" });
    });
  });

  describe("capabilities.rules.buildInstallPath()", () => {
    it("builds path under .opencode/rules/", () => {
      const path = opencode.capabilities.rules?.buildInstallPath("01-standards/naming.md");
      expect(path).toBe(".opencode/rules/01-standards/naming.md");
    });
  });

  describe("capabilities.rules.convertFrontmatter()", () => {
    it("returns empty frontmatter regardless of input (paths, always-apply)", () => {
      const result = opencode.capabilities.rules?.convertFrontmatter({
        paths: ["src/**/*.ts"],
      });
      expect(result).toEqual({});
    });

    it("returns empty frontmatter for always-apply rules", () => {
      const result = opencode.capabilities.rules?.convertFrontmatter({
        description: "always",
      });
      expect(result).toEqual({});
    });

    it("keeps description when alwaysApply is false and no paths are specified", () => {
      const result = opencode.capabilities.rules?.convertFrontmatter({
        description: "Apply when editing command files.",
        alwaysApply: false,
      });
      expect(result).toEqual({ description: "Apply when editing command files." });
    });
  });

  describe("capabilities.skills.buildInstallPath()", () => {
    it("builds path under .opencode/skills/", () => {
      const path = opencode.capabilities.skills.buildInstallPath("my-skill/SKILL.md");
      expect(path).toBe(".opencode/skills/my-skill/SKILL.md");
    });
  });

  describe("capabilities.skills.convertFrontmatter()", () => {
    it("preserves all frontmatter fields", () => {
      const fm = { name: "my-skill", description: "A skill" };
      expect(opencode.capabilities.skills.convertFrontmatter(fm)).toEqual(fm);
    });
  });

  describe("capabilities.mcp", () => {
    it("maps both opencode and mcp config names to opencode.json", () => {
      expect(opencode.capabilities.mcp.params.outputPath).toBe("opencode.json");
      expect(opencode.capabilities.mcp.consumes).toContain("opencode");
      expect(opencode.capabilities.mcp.consumes).toContain("mcp");
    });

    it("does not consume unknown config names", () => {
      expect(opencode.capabilities.mcp.consumes).not.toContain("unknown");
    });

    it("uses framework-prime merge strategy", () => {
      expect(opencode.capabilities.mcp.params.mergeStrategy).toBe("framework-prime");
    });
  });

  describe("capabilities.mcp.transform() (MCP transform)", () => {
    it("is defined on the OpenCode mcp capability", () => {
      expect(opencode.capabilities.mcp.params.transformContent).toBeDefined();
    });

    const transform = (configName: string, content: string): string => {
      if (configName !== "mcp") return content;
      const fn = opencode.capabilities.mcp.params.transformContent;
      if (!fn) throw new Error("transformContent not defined");
      return fn(content);
    };

    it("transforms mcpServers to OpenCode mcp format with env", () => {
      const input = JSON.stringify({
        mcpServers: {
          "my-server": {
            command: "npx",
            args: ["-y", "@some/mcp-server"],
            env: { API_KEY: "secret" },
          },
        },
      });
      expect(JSON.parse(transform("mcp", input))).toEqual({
        mcp: {
          "my-server": {
            type: "local",
            command: ["npx", "-y", "@some/mcp-server"],
            enabled: true,
            environment: { API_KEY: "secret" },
          },
        },
      });
    });

    it("omits environment when env field is absent", () => {
      const input = JSON.stringify({
        mcpServers: { server: { command: "node", args: ["server.js"] } },
      });
      expect(JSON.parse(transform("mcp", input)).mcp.server).not.toHaveProperty("environment");
    });

    it("omits environment when env is explicitly empty", () => {
      const input = JSON.stringify({
        mcpServers: { server: { command: "node", env: {} } },
      });
      expect(JSON.parse(transform("mcp", input)).mcp.server).not.toHaveProperty("environment");
    });

    it("produces empty mcp object when mcpServers is empty", () => {
      const input = JSON.stringify({ mcpServers: {} });
      expect(JSON.parse(transform("mcp", input))).toEqual({ mcp: {} });
    });

    it("throws with context on malformed JSON", () => {
      expect(() => transform("mcp", "not-json")).toThrow("Cannot parse MCP config:");
    });

    it("throws when root is not an object (array)", () => {
      expect(() => transform("mcp", "[]")).toThrow("MCP config must be a JSON object");
    });

    it("transforms url-based server to remote format", () => {
      const input = JSON.stringify({
        mcpServers: { figma: { url: "https://mcp.figma.com/mcp", type: "http" } },
      });
      expect(JSON.parse(transform("mcp", input))).toEqual({
        mcp: { figma: { type: "remote", url: "https://mcp.figma.com/mcp", enabled: true } },
      });
    });

    it("handles mixed local and remote servers in the same config", () => {
      const input = JSON.stringify({
        mcpServers: {
          local: { command: "npx", args: ["-y", "pkg"] },
          remote: { url: "https://example.com/mcp" },
        },
      });
      const result = JSON.parse(transform("mcp", input));
      expect(result.mcp.local.type).toBe("local");
      expect(result.mcp.remote.type).toBe("remote");
    });

    it("throws when a server has neither command nor url", () => {
      const input = JSON.stringify({ mcpServers: { bad: { token: "abc" } } });
      expect(() => transform("mcp", input)).toThrow(
        'MCP server "bad" must have either a "command" or "url" field'
      );
    });

    it("returns non-mcp content unchanged", () => {
      const content = '{"instructions":[".opencode/rules/**/*.md"]}';
      expect(transform("opencode", content)).toBe(content);
    });

    it("sets enabled: false on local server with disabled: true", () => {
      const input = JSON.stringify({
        mcpServers: { "my-server": { command: "node", args: ["server.js"], disabled: true } },
      });
      expect(JSON.parse(transform("mcp", input)).mcp["my-server"].enabled).toBe(false);
    });

    it("sets enabled: false on remote server with disabled: true", () => {
      const input = JSON.stringify({
        mcpServers: { figma: { url: "https://mcp.figma.com/mcp", disabled: true } },
      });
      expect(JSON.parse(transform("mcp", input)).mcp.figma.enabled).toBe(false);
    });

    it("preserves mixed enabled/disabled servers correctly", () => {
      const input = JSON.stringify({
        mcpServers: {
          enabled: { command: "node", args: ["on.js"] },
          disabled: { command: "node", args: ["off.js"], disabled: true },
        },
      });
      const result = JSON.parse(transform("mcp", input));
      expect(result.mcp.enabled.enabled).toBe(true);
      expect(result.mcp.disabled.enabled).toBe(false);
    });

    it("sets enabled: true when disabled is explicitly false", () => {
      const input = JSON.stringify({
        mcpServers: { "my-server": { command: "node", disabled: false } },
      });
      expect(JSON.parse(transform("mcp", input)).mcp["my-server"].enabled).toBe(true);
    });
  });

  describe("capabilities.mcp.resolveOutput()", () => {
    const PROJECT_ROOT = "/project";

    async function resolve(fs: FileReader): Promise<string> {
      return opencode.capabilities.mcp.resolveOutput(PROJECT_ROOT, fs);
    }

    it("returns opencode.json when neither config file exists", async () => {
      expect(await resolve(makeFs([]))).toBe("opencode.json");
    });

    it("returns opencode.json when only opencode.json exists", async () => {
      expect(await resolve(makeFs(["opencode.json"]))).toBe("opencode.json");
    });

    it("returns opencode.jsonc when only opencode.jsonc exists", async () => {
      expect(await resolve(makeFs(["opencode.jsonc"]))).toBe("opencode.jsonc");
    });

    it("throws OpencodeDualConfigError when both opencode.json and opencode.jsonc exist", async () => {
      await expect(resolve(makeFs(["opencode.json", "opencode.jsonc"]))).rejects.toThrow(
        OpencodeDualConfigError
      );
    });
  });

  describe("capabilities.plugins", () => {
    it("has a plugins capability", () => {
      expect("plugins" in opencode.capabilities).toBe(true);
    });

    it("is flat mode", () => {
      expect(opencode.capabilities.plugins.mode).toBe("flat");
    });

    it("uses aidd- as flat namespace prefix", () => {
      expect(opencode.capabilities.plugins.flatNamespacePrefix).toBe("aidd-");
    });

    it("pluginsDir is null", () => {
      expect(opencode.capabilities.plugins.pluginsDir).toBeNull();
    });

    it("pluginOutputDir returns null", () => {
      expect(opencode.capabilities.plugins.pluginOutputDir("my-plugin")).toBeNull();
    });
  });
});
