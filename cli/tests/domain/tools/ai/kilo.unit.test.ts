import { describe, expect, it } from "vitest";
import { KiloDualConfigError } from "../../../../src/domain/errors.js";
import type { FileReader } from "../../../../src/domain/ports/file-reader.js";
import { kilo } from "../../../../src/domain/tools/ai/kilo.js";

function makeFs(existingPaths: string[]): FileReader {
  return {
    fileExists: async (path: string) => existingPaths.some((p) => path.endsWith(p)),
  } as unknown as FileReader;
}

describe("kilo", () => {
  it("installs native skills, agents, commands, and rules under .kilo", () => {
    expect(kilo.capabilities.skills.buildInstallPath("my-skill/SKILL.md")).toBe(
      ".kilo/skills/my-skill/SKILL.md"
    );
    expect(kilo.capabilities.agents.buildInstallPath("reviewer.kilo.md")).toBe(
      ".kilo/agents/reviewer.md"
    );
    expect(kilo.capabilities.commands?.buildInstallPath("04_code/implement.md")).toBe(
      ".kilo/commands/aidd/04/implement.md"
    );
    expect(kilo.capabilities.rules?.buildInstallPath("01-standards/naming.md")).toBe(
      ".kilo/rules/01-standards/naming.md"
    );
  });

  it("uses Kilo-compatible subagent frontmatter", () => {
    expect(
      kilo.capabilities.agents.convertFrontmatter({
        name: "reviewer",
        description: "Review code",
      })
    ).toEqual({ description: "Review code", mode: "subagent" });
  });

  it("writes MCP configuration to kilo.json and preserves JSONC ownership", async () => {
    expect(kilo.capabilities.mcp.params.outputPath).toBe("kilo.json");
    expect(await kilo.capabilities.mcp.resolveOutput("/project", makeFs([]))).toBe("kilo.json");
    expect(await kilo.capabilities.mcp.resolveOutput("/project", makeFs(["kilo.jsonc"]))).toBe(
      "kilo.jsonc"
    );
  });

  it("rejects ambiguous kilo.json and kilo.jsonc configuration", async () => {
    await expect(
      kilo.capabilities.mcp.resolveOutput("/project", makeFs(["kilo.json", "kilo.jsonc"]))
    ).rejects.toThrow(KiloDualConfigError);
  });

  it("detects Kilo user-file sections", () => {
    expect(kilo.detectUserFileSectionKey(".kilo/skills/my-skill/SKILL.md")).toEqual({
      section: "skills",
      key: "my-skill/SKILL.md",
    });
    expect(kilo.detectUserFileSectionKey(".kilo/agents/reviewer.md")).toEqual({
      section: "agents",
      key: "reviewer.md",
    });
  });
});
