// Register the claude and copilot tools so their capabilities are accessible
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import { describe, expect, it } from "vitest";
import { InstallSkillsUseCase } from "../../../../src/application/use-cases/install/install-skills-use-case.js";
import { claude } from "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { copilot } from "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import type { ContentSection } from "../../../../src/domain/models/framework.js";
import { GITKEEP_FILE } from "../../../../src/kernel/file.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";

const DOCS_DIR = "aidd_docs";

// Skills section without entryFile filter (flat mode)
const skillsSectionFlat: ContentSection = {
  name: "skills",
  directory: "skills",
  entryFile: null,
};

// Skills section with entryFile: "SKILL.md" (plugin/subdirectory mode)
const skillsSectionWithEntry: ContentSection = {
  name: "skills",
  directory: "skills",
  entryFile: "SKILL.md",
};

function buildUseCase() {
  const hasher = new DeterministicHasher();
  const useCase = new InstallSkillsUseCase(hasher);
  return { hasher, useCase };
}

describe("InstallSkillsUseCase", () => {
  describe("execute — flat section (no entryFile)", () => {
    it("produces an InstallationFile with correct relativePath for a claude skill", () => {
      const { hasher, useCase } = buildUseCase();
      const rawContent = "---\nname: hello\ndescription: A simple skill\n---\n# Hello skill\n";
      const contentFiles = new Map([["skills/hello.claude.md", rawContent]]);

      const files = useCase.execute({
        toolConfig: claude,
        section: skillsSectionFlat,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(1);
      const [file] = files;
      expect(file.relativePath).toBe(".claude/skills/hello.md");
      expect(file.frameworkPath).toBe("skills/hello.claude.md");
      expect(file.hash).toEqual(hasher.hash(file.content));
    });

    it("returns empty array when contentFiles map is empty", () => {
      const { useCase } = buildUseCase();

      const files = useCase.execute({
        toolConfig: claude,
        section: skillsSectionFlat,
        contentFiles: new Map(),
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(0);
    });

    it("returns empty array when files are outside the skills section directory", () => {
      const { useCase } = buildUseCase();
      const contentFiles = new Map([
        ["agents/my-agent.claude.md", "# agent"],
        ["rules/naming.claude.md", "# rule"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: skillsSectionFlat,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(0);
    });

    it("filters out skill files for other tools", () => {
      const { useCase } = buildUseCase();
      const contentFiles = new Map([
        ["skills/my-skill.cursor.md", "# cursor skill"],
        ["skills/my-skill.claude.md", "# claude skill"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: skillsSectionFlat,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(1);
      expect(files[0].frameworkPath).toBe("skills/my-skill.claude.md");
    });

    it("produces an empty-content InstallationFile for .gitkeep files", () => {
      const { hasher, useCase } = buildUseCase();
      const gitkeepPath = `skills/${GITKEEP_FILE}`;
      const contentFiles = new Map([[gitkeepPath, ""]]);

      const files = useCase.execute({
        toolConfig: claude,
        section: skillsSectionFlat,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(1);
      expect(files[0].content).toBe("");
      expect(files[0].hash).toEqual(hasher.hash(""));
    });

    it("processes multiple skills in a single call", () => {
      const { useCase } = buildUseCase();
      const contentFiles = new Map([
        ["skills/skill-a.claude.md", "---\nname: skill-a\ndescription: A\n---\n# A\n"],
        ["skills/skill-b.claude.md", "---\nname: skill-b\ndescription: B\n---\n# B\n"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: skillsSectionFlat,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(2);
      const paths = files.map((f) => f.relativePath).sort();
      expect(paths).toContain(".claude/skills/skill-a.md");
      expect(paths).toContain(".claude/skills/skill-b.md");
    });
  });

  describe("execute — entryFile section (SKILL.md)", () => {
    it("accepts only SKILL.md files and installs them at the correct path", () => {
      const { useCase } = buildUseCase();
      const contentFiles = new Map([
        ["skills/my-skill/SKILL.md", "---\nname: my-skill\ndescription: My skill\n---\n# Skill\n"],
        ["skills/my-skill/other.claude.md", "---\nname: other\ndescription: Other\n---\n# Other\n"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: skillsSectionWithEntry,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      // Only SKILL.md passes the entryFile filter
      expect(files).toHaveLength(1);
      expect(files[0].frameworkPath).toBe("skills/my-skill/SKILL.md");
    });

    it("filters out non-SKILL.md files from subdirectory skills", () => {
      const { useCase } = buildUseCase();
      const contentFiles = new Map([
        ["skills/commit/helper.claude.md", "# helper — not SKILL.md basename"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: skillsSectionWithEntry,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(0);
    });
  });

  describe("execute — tool with a null install path for .gitkeep", () => {
    it("filters out the .gitkeep file entirely instead of producing an empty InstallationFile", () => {
      const { useCase } = buildUseCase();
      const gitkeepPath = `skills/${GITKEEP_FILE}`;
      const contentFiles = new Map([[gitkeepPath, ""]]);

      const files = useCase.execute({
        toolConfig: copilot,
        section: skillsSectionFlat,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(0);
    });
  });
});
