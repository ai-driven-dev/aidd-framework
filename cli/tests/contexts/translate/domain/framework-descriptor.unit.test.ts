import { describe, expect, it } from "vitest";
import { FrameworkDescriptor } from "../../../../src/contexts/translate/domain/canon.js";

function makeDescriptor() {
  return new FrameworkDescriptor({
    version: "3.2.2",
    contentSections: [
      { name: "agents", directory: "agents", entryFile: null },
      { name: "commands", directory: "commands", entryFile: null },
      { name: "rules", directory: "rules", entryFile: null },
      { name: "skills", directory: "skills", entryFile: "SKILL.md" },
    ],
    templateRefs: [{ name: "agentsMd", path: "aidd_docs/templates/AGENTS.md" }],
    configRefs: [
      { name: "mcp", path: "config/mcp.json" },
      { name: "vscodeDir", path: "config/vscode" },
    ],
  });
}

describe("FrameworkDescriptor", () => {
  describe("constructor", () => {
    it("exposes the version passed to the constructor", () => {
      const d = makeDescriptor();
      expect(d.version).toBe("3.2.2");
    });

    it("contentSections cannot be mutated after construction", () => {
      const d = makeDescriptor();
      expect(() => {
        (d.contentSections as unknown[]).push("x");
      }).toThrow();
    });
  });

  describe("getContentSection()", () => {
    const descriptor = makeDescriptor();

    it("returns a section by name with its directory and entryFile", () => {
      const section = descriptor.getContentSection("agents");
      expect(section?.name).toBe("agents");
      expect(section?.directory).toBe("agents");
      expect(section?.entryFile).toBeNull();
    });

    it("returns skills section with its entryFile set", () => {
      const section = descriptor.getContentSection("skills");
      expect(section).toBeDefined();
      expect(section?.entryFile).toBe("SKILL.md");
    });

    it("returns undefined for unknown section name", () => {
      expect(descriptor.getContentSection("nonexistent")).toBeUndefined();
    });
  });

  describe("getTemplate()", () => {
    const descriptor = makeDescriptor();

    it("returns agentsMd template", () => {
      const template = descriptor.getTemplate("agentsMd");
      expect(template).toBeDefined();
      expect(template?.path).toBe("aidd_docs/templates/AGENTS.md");
    });

    it("returns undefined for unknown template name", () => {
      expect(descriptor.getTemplate("unknown")).toBeUndefined();
    });
  });

  describe("getConfig()", () => {
    const descriptor = makeDescriptor();

    it("returns mcp config", () => {
      const config = descriptor.getConfig("mcp");
      expect(config).toBeDefined();
      expect(config?.path).toBe("config/mcp.json");
    });

    it("returns vscodeDir config", () => {
      const config = descriptor.getConfig("vscodeDir");
      expect(config).toBeDefined();
      expect(config?.path).toBe("config/vscode");
    });

    it("returns undefined for unknown config name", () => {
      expect(descriptor.getConfig("unknown")).toBeUndefined();
    });
  });
});
