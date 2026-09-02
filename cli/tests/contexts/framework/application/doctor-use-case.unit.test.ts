import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractAtReferences,
  extractMarkdownLinkTargets,
} from "../../../../src/domain/formats/markdown-references.js";
import type { ToolId } from "../../../../src/kernel/tool.js";
import {
  buildDoctorUseCase,
  buildUnitDeps,
  initAndInstall,
} from "../../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

describe("extractAtReferences", () => {
  it("extracts @path references with at least one slash", () => {
    expect(extractAtReferences("See @.claude/agents/iris.md for details")).toEqual([
      ".claude/agents/iris.md",
    ]);
  });

  it("deduplicates identical references", () => {
    const refs = extractAtReferences("@foo/bar.md and @foo/bar.md again");
    expect(refs).toHaveLength(1);
  });

  it("ignores @word with no slash (single-segment)", () => {
    expect(extractAtReferences("@username has no slash")).toEqual([]);
  });

  it("extracts @path references inside plain fenced code blocks (no language)", () => {
    expect(extractAtReferences("```\n@.claude/agents/missing.md\n```")).toEqual([
      ".claude/agents/missing.md",
    ]);
  });

  it("extracts @path references inside ```markdown fenced code blocks", () => {
    expect(extractAtReferences("```markdown\n@aidd_docs/templates/aidd/agent.md\n```")).toEqual([
      "aidd_docs/templates/aidd/agent.md",
    ]);
  });

  it("skips @path references inside non-markdown fenced code blocks (e.g. ```text)", () => {
    expect(extractAtReferences("```text\n@path/to/file.md\n```")).toEqual([]);
  });

  it("skips references inside inline code", () => {
    expect(extractAtReferences("`@.claude/rules/test.md`")).toEqual([]);
  });
});

describe("extractMarkdownLinkTargets", () => {
  it("extracts relative markdown link targets", () => {
    expect(extractMarkdownLinkTargets("[doc](aidd_docs/memory/architecture.md)")).toEqual([
      "aidd_docs/memory/architecture.md",
    ]);
  });

  it("ignores http/https links", () => {
    expect(extractMarkdownLinkTargets("[site](https://example.com)")).toEqual([]);
  });

  it("deduplicates identical targets", () => {
    const refs = extractMarkdownLinkTargets("[a](foo/bar.md) [b](foo/bar.md)");
    expect(refs).toHaveLength(1);
  });

  it("extracts targets inside plain fenced code blocks (no language)", () => {
    expect(extractMarkdownLinkTargets("```\n[doc](foo/bar.md)\n```")).toEqual(["foo/bar.md"]);
  });

  it("extracts targets inside ```markdown fenced code blocks", () => {
    expect(extractMarkdownLinkTargets("```markdown\n[doc](aidd_docs/memory/arch.md)\n```")).toEqual(
      ["aidd_docs/memory/arch.md"]
    );
  });

  it("skips targets inside non-markdown fenced code blocks (e.g. ```text)", () => {
    expect(extractMarkdownLinkTargets("```text\n[doc](foo/bar.md)\n```")).toEqual([]);
  });
});

describe("doctor", () => {
  it("reports healthy when all files are in sync", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const useCase = buildDoctorUseCase(deps);
    const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(report.healthy).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("fails when manifest is corrupted", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    // Corrupt manifest by replacing it in-memory with invalid JSON
    // ManifestRepositoryAdapter uses load() — InMemoryManifestRepository just returns null or manifest
    // We need to simulate a corrupt manifest. The doctor calls manifestRepo.load(),
    // so we make it throw.
    const corruptRepo = Object.create(deps.manifestRepo) as typeof deps.manifestRepo;
    corruptRepo.load = async () => {
      throw new Error("Manifest is corrupted");
    };
    const useCase = buildDoctorUseCase({ ...deps, manifestRepo: corruptRepo });
    await expect(useCase.execute({ projectRoot: PROJECT_ROOT })).rejects.toThrow(
      "Manifest is corrupted"
    );
  });

  it("fails if project is not initialized", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);

    const useCase = buildDoctorUseCase(deps);
    await expect(useCase.execute({ projectRoot: PROJECT_ROOT })).rejects.toThrow("aidd setup");
  });

  it("warns about tool directory not registered in manifest", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    // Create an orphaned .cursor/commands directory (cursor is not installed)
    await deps.fs.writeFile(
      join(PROJECT_ROOT, ".cursor", "commands", "plan.md"),
      "---\nname: aidd:03:plan\ndescription: Plan feature\n---\nContent here.\n"
    );

    const useCase = buildDoctorUseCase(deps);
    const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

    const orphanIssue = report.issues.find(
      (i) => i.message.includes(".cursor/") && i.message.includes("Orphaned")
    );
    expect(orphanIssue).toBeDefined();
  });

  it("does not report broken reference for directory-only @path (trailing slash, no extension)", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const firstFile = { relativePath: ".claude/plugins/aidd-test/agents/code-reviewer.md" };
    await deps.fs.writeFile(
      join(PROJECT_ROOT, firstFile.relativePath),
      "See @.claude/agents/ for all agents"
    );

    const useCase = buildDoctorUseCase(deps);
    const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

    const brokenRefIssues = report.issues.filter((i) => i.message.startsWith("Broken reference"));
    expect(brokenRefIssues.every((i) => !i.message.includes(".claude/agents/"))).toBe(true);
  });

  it("does not report broken @path reference inside non-markdown fenced code block", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const firstFile = { relativePath: ".claude/plugins/aidd-test/agents/code-reviewer.md" };
    await deps.fs.writeFile(
      join(PROJECT_ROOT, firstFile.relativePath),
      "```text\n@path/to/example.md\n```"
    );

    const useCase = buildDoctorUseCase(deps);
    const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(report.issues.every((i) => !i.message.includes("example.md"))).toBe(true);
  });

  describe("orphan and missing file checks", () => {
    it("does not warn about standard GitHub directories when Copilot is not installed", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

      // Create a .github directory with non-aidd content
      await deps.fs.writeFile(
        join(PROJECT_ROOT, ".github", "workflows", "ci.yml"),
        "name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n"
      );

      const useCase = buildDoctorUseCase(deps);
      const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

      const githubOrphanIssue = report.issues.find(
        (i) => i.message.includes(".github/") && i.message.includes("Orphaned")
      );
      expect(githubOrphanIssue).toBeUndefined();
    });

    it("warns when Copilot files are present on disk but not tracked in the manifest", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

      // Create .github/prompts/ with an aidd-named prompt file (not tracked in manifest)
      await deps.fs.writeFile(
        join(PROJECT_ROOT, ".github", "prompts", "plan.prompt.md"),
        "---\nname: aidd:01:plan\ndescription: Plan feature\n---\nContent here.\n"
      );

      const useCase = buildDoctorUseCase(deps);
      const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

      const orphanIssues = report.issues.filter(
        (i) => i.message.includes(".github/") && i.message.includes("Orphaned")
      );
      expect(orphanIssues).toHaveLength(1);
      expect(orphanIssues[0].severity).toBe("warning");
    });

    it("does not warn about non-aidd files found in Copilot directories", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

      await deps.fs.writeFile(
        join(PROJECT_ROOT, ".github", "prompts", "custom.prompt.md"),
        "---\nname: my-custom-prompt\ndescription: A custom prompt\n---\nContent here.\n"
      );

      const useCase = buildDoctorUseCase(deps);
      const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

      const githubOrphanIssue = report.issues.find(
        (i) => i.message.includes(".github/") && i.message.includes("Orphaned")
      );
      expect(githubOrphanIssue).toBeUndefined();
    });
  });

  describe("merge file key checks", () => {
    it("is healthy when merge file keys match the manifest", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "vscode" as ToolId);

      const useCase = buildDoctorUseCase(deps);
      const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

      const mergeIssues = report.issues.filter(
        (i) => i.message.includes("merge file") || i.message.includes("key in")
      );
      expect(mergeIssues).toHaveLength(0);
    });
  });
});
