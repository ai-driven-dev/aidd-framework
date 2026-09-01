// Register the claude and copilot tools so their capabilities are accessible
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import { describe, expect, it } from "vitest";
import { InstallRulesUseCase } from "../../../../src/application/use-cases/install/install-rules-use-case.js";
import { claude } from "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { copilot } from "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import type { ContentSection } from "../../../../src/contexts/translate/domain/canon.js";
import { GITKEEP_FILE } from "../../../../src/kernel/file.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";

const DOCS_DIR = "aidd_docs";

const rulesSection: ContentSection = {
  name: "rules",
  directory: "rules",
  entryFile: null,
};

const rulesSectionWithEntry: ContentSection = {
  name: "rules",
  directory: "rules",
  entryFile: "RULE.md",
};

function buildUseCase() {
  const hasher = new DeterministicHasher();
  const useCase = new InstallRulesUseCase(hasher);
  return { hasher, useCase };
}

describe("InstallRulesUseCase", () => {
  describe("execute", () => {
    it("produces an InstallationFile with correct relativePath for a claude rule", () => {
      const { hasher, useCase } = buildUseCase();
      const rawContent = "---\npaths:\n  - src/**/*.ts\n---\n# TypeScript rules\n";
      const contentFiles = new Map([["rules/01-standards/typescript.claude.md", rawContent]]);

      const files = useCase.execute({
        toolConfig: claude,
        section: rulesSection,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(1);
      const [file] = files;
      expect(file.relativePath).toBe(".claude/rules/01-standards/typescript.md");
      expect(file.frameworkPath).toBe("rules/01-standards/typescript.claude.md");
      expect(file.hash).toEqual(hasher.hash(file.content));
    });

    it("returns empty array when contentFiles map is empty", () => {
      const { useCase } = buildUseCase();

      const files = useCase.execute({
        toolConfig: claude,
        section: rulesSection,
        contentFiles: new Map(),
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(0);
    });

    it("returns empty array when files are outside the rules section directory", () => {
      const { useCase } = buildUseCase();
      const contentFiles = new Map([
        ["agents/my-agent.claude.md", "# agent"],
        ["skills/my-skill/SKILL.md", "# skill"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: rulesSection,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(0);
    });

    it("filters out rule files for other tools", () => {
      const { useCase } = buildUseCase();
      const contentFiles = new Map([
        ["rules/01-standards/naming.cursor.md", "# cursor rule"],
        ["rules/01-standards/naming.claude.md", "# claude rule"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: rulesSection,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(1);
      expect(files[0].frameworkPath).toBe("rules/01-standards/naming.claude.md");
    });

    it("produces an empty-content InstallationFile for .gitkeep files", () => {
      const { hasher, useCase } = buildUseCase();
      const gitkeepPath = `rules/01-standards/${GITKEEP_FILE}`;
      const contentFiles = new Map([[gitkeepPath, ""]]);

      const files = useCase.execute({
        toolConfig: claude,
        section: rulesSection,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(1);
      expect(files[0].content).toBe("");
      expect(files[0].hash).toEqual(hasher.hash(""));
    });

    it("converts paths frontmatter via the capability's convertFrontmatter", () => {
      const { useCase } = buildUseCase();
      const rawContent = "---\npaths:\n  - src/**/*.ts\n  - src/**/*.tsx\n---\n# Rule body\n";
      const contentFiles = new Map([["rules/01-standards/ts.claude.md", rawContent]]);

      const files = useCase.execute({
        toolConfig: claude,
        section: rulesSection,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(1);
      expect(files[0].content).toContain("paths:");
      expect(files[0].content).toContain("src/**/*.ts");
    });

    it("strips empty paths array from frontmatter", () => {
      const { useCase } = buildUseCase();
      // When paths is empty, claude rules capability strips it to {}
      const rawContent = "---\npaths:\n---\n# Rule with no paths\n";
      const contentFiles = new Map([["rules/always-apply.claude.md", rawContent]]);

      const files = useCase.execute({
        toolConfig: claude,
        section: rulesSection,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(1);
      // serialized without frontmatter (empty object → no --- block)
      expect(files[0].content).not.toContain("paths:");
    });

    it("processes multiple rules in a single call", () => {
      const { useCase } = buildUseCase();
      const contentFiles = new Map([
        ["rules/01-standards/rule-a.claude.md", "# rule A"],
        ["rules/02-patterns/rule-b.claude.md", "# rule B"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: rulesSection,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(2);
      const paths = files.map((f) => f.relativePath).sort();
      expect(paths).toContain(".claude/rules/01-standards/rule-a.md");
      expect(paths).toContain(".claude/rules/02-patterns/rule-b.md");
    });
  });

  describe("execute — entryFile section", () => {
    it("accepts only the entryFile-named file and installs it", () => {
      const { useCase } = buildUseCase();
      const contentFiles = new Map([
        ["rules/my-rule/RULE.md", "---\npaths:\n  - src/**\n---\n# Rule\n"],
        ["rules/my-rule/other.claude.md", "---\npaths:\n  - src/**\n---\n# Other\n"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: rulesSectionWithEntry,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(1);
      expect(files[0].frameworkPath).toBe("rules/my-rule/RULE.md");
    });

    it("filters out files whose basename does not match entryFile", () => {
      const { useCase } = buildUseCase();
      const contentFiles = new Map([
        ["rules/standards/helper.claude.md", "# helper — not RULE.md basename"],
      ]);

      const files = useCase.execute({
        toolConfig: claude,
        section: rulesSectionWithEntry,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(0);
    });
  });

  describe("execute — tool with a null install path for .gitkeep", () => {
    it("filters out the .gitkeep file entirely instead of producing an empty InstallationFile", () => {
      const { useCase } = buildUseCase();
      const gitkeepPath = `rules/${GITKEEP_FILE}`;
      const contentFiles = new Map([[gitkeepPath, ""]]);

      const files = useCase.execute({
        toolConfig: copilot,
        section: rulesSection,
        contentFiles,
        docsDir: DOCS_DIR,
      });

      expect(files).toHaveLength(0);
    });
  });
});
