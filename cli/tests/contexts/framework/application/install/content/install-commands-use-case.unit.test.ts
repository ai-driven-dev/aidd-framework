// Register the claude and copilot tools so their capabilities are accessible
import "../../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import { describe, expect, it } from "vitest";
import { InstallCommandsUseCase } from "../../../../../../src/contexts/framework/application/install/content/install-commands-use-case.js";
import { claude } from "../../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { copilot } from "../../../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import type { ContentSection } from "../../../../../../src/contexts/translate/domain/canon.js";
import { GITKEEP_FILE } from "../../../../../../src/kernel/file.js";
import { DeterministicHasher } from "../../../../../helpers/ports/deterministic-hasher.js";

const _DOCS_DIR = "aidd_docs";

const commandsSection: ContentSection = {
  name: "commands",
  directory: "commands",
  entryFile: null,
};

function buildUseCase() {
  const hasher = new DeterministicHasher();
  const useCase = new InstallCommandsUseCase(hasher);
  return { hasher, useCase };
}

describe("InstallCommandsUseCase", () => {
  describe("execute", () => {
    it("produces an InstallationFile with correct relativePath and content for a standard command", () => {
      const { hasher, useCase } = buildUseCase();
      const rawContent =
        "---\nname: implement\ndescription: Implement a feature\n---\n# Implementation\n";
      const contentFiles = new Map([["commands/04_code/implement.claude.md", rawContent]]);

      const files = useCase.execute({
        toolConfig: claude,
        section: commandsSection,
        contentFiles,
      });

      expect(files).toHaveLength(1);
      const [file] = files;
      expect(file.relativePath).toBe(".claude/commands/aidd/04/implement.claude.md");
      expect(file.frameworkPath).toBe("commands/04_code/implement.claude.md");
      expect(file.hash).toEqual(hasher.hash(file.content));
    });

    it("returns empty array when contentFiles map is empty", () => {
      const { useCase } = buildUseCase();

      const files = useCase.execute({
        toolConfig: claude,
        section: commandsSection,
        contentFiles: new Map(),
      });

      expect(files).toHaveLength(0);
    });

    it("returns empty array when no files match the section directory prefix", () => {
      const { useCase } = buildUseCase();
      const contentFiles = new Map([
        ["agents/my-agent.claude.md", "# agent"],
        ["rules/standards/naming.claude.md", "# rule"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: commandsSection,
        contentFiles,
      });

      expect(files).toHaveLength(0);
    });

    it("filters out files for other tools (foreign tool suffix)", () => {
      const { useCase } = buildUseCase();
      const contentFiles = new Map([
        ["commands/04_code/implement.cursor.md", "# cursor command"],
        ["commands/04_code/implement.claude.md", "# claude command"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: commandsSection,
        contentFiles,
      });

      expect(files).toHaveLength(1);
      expect(files[0].frameworkPath).toBe("commands/04_code/implement.claude.md");
    });

    it("produces an empty-content InstallationFile for .gitkeep files", () => {
      const { hasher, useCase } = buildUseCase();
      const gitkeepPath = `commands/04_code/${GITKEEP_FILE}`;
      const contentFiles = new Map([[gitkeepPath, ""]]);

      const files = useCase.execute({
        toolConfig: claude,
        section: commandsSection,
        contentFiles,
      });

      expect(files).toHaveLength(1);
      expect(files[0].content).toBe("");
      expect(files[0].hash).toEqual(hasher.hash(""));
    });

    it("converts frontmatter via the capability's convertFrontmatter", () => {
      const { useCase } = buildUseCase();
      const rawContent =
        "---\nname: test-cmd\ndescription: test description\nargument-hint: $ARG\n---\n# body\n";
      const contentFiles = new Map([["commands/04_code/test-cmd.claude.md", rawContent]]);

      const files = useCase.execute({
        toolConfig: claude,
        section: commandsSection,
        contentFiles,
      });

      expect(files).toHaveLength(1);
      expect(files[0].content).toContain("test-cmd");
    });

    it("respects entryFile filter when section has an entryFile", () => {
      const { useCase } = buildUseCase();
      const sectionWithEntry: ContentSection = {
        name: "commands",
        directory: "commands",
        entryFile: "SKILL.md",
      };
      const contentFiles = new Map([
        ["commands/other.claude.md", "# not the entry file"],
        ["commands/SKILL.md", "# the entry file"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: sectionWithEntry,
        contentFiles,
      });

      const paths = files.map((f) => f.frameworkPath);
      expect(paths).not.toContain("commands/other.claude.md");
    });

    it("filters out the .gitkeep file entirely when the tool's install path is null for it", () => {
      const { useCase } = buildUseCase();
      const gitkeepPath = `commands/04_code/${GITKEEP_FILE}`;
      const contentFiles = new Map([[gitkeepPath, ""]]);

      const files = useCase.execute({
        toolConfig: copilot,
        section: commandsSection,
        contentFiles,
      });

      expect(files).toHaveLength(0);
    });
  });
});
