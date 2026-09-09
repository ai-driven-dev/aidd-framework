import { join } from "node:path";
import { describe, expect, it } from "vitest";
// Side-effect imports: this use case asks the registry which tools have rules at all, so a
// tool that never registered is a tool it silently cannot see.
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { ListInstalledRulesUseCase } from "../../../../src/contexts/framework/application/list-installed-rules-use-case.js";
import type { FileReader } from "../../../../src/kernel/ports/file-reader.js";

const ROOT = "/project";

/** The four members this use case never calls reject rather than answer a placeholder, which
 * would let it start reading through the wrong member and still look green. */
function readerOf(files: Readonly<Record<string, string>>): FileReader {
  const unused = (member: string) => (): never => {
    throw new Error(`this use case does not call ${member}`);
  };
  return {
    listFilesRecursive: async (dir: string) =>
      Object.keys(files).filter((path) => path.startsWith(dir.replaceAll("\\", "/"))),
    readFile: async (path: string) => files[path.replaceAll("\\", "/")] ?? "",
    listDirectory: unused("listDirectory"),
    fileExists: unused("fileExists"),
    readFileHash: unused("readFileHash"),
    isExecutable: unused("isExecutable"),
    realpath: unused("realpath"),
  };
}

const at = (relative: string) => join(ROOT, relative).replaceAll("\\", "/");

describe("ListInstalledRulesUseCase — every tool's installed rules, in one answer", () => {
  it("finds a rule under each tool's own installed directory", async () => {
    const useCase = new ListInstalledRulesUseCase(
      readerOf({
        [at(".claude/rules/01-standards/1-naming.md")]: "---\ndescription: Names\n---\n",
        [at(".cursor/rules/1-naming.mdc")]: "---\n---\n",
        [at(".github/instructions/01-naming.instructions.md")]: "---\n---\n",
        [at(".codex/rules/1-naming.md")]: "---\n---\n",
        [at(".opencode/rules/1-naming.md")]: "---\n---\n",
      })
    );

    const { rules } = await useCase.execute({ projectRoot: ROOT });

    expect(rules.map((rule) => rule.tool).sort()).toEqual([
      "claude",
      "codex",
      "copilot",
      "cursor",
      "opencode",
    ]);
  });

  // `content-translator.ts` installs a plugin's `rules/` into every tool whose capability
  // accepts them, Codex included, so a Codex project holding rules must never be told none.
  it("answers for Codex, which the script it replaces skipped outright", async () => {
    const useCase = new ListInstalledRulesUseCase(
      readerOf({ [at(".codex/rules/1-naming.md")]: "---\ndescription: Names\n---\n" })
    );

    const { rules } = await useCase.execute({ projectRoot: ROOT });

    expect(rules).toEqual([
      {
        tool: "codex",
        path: ".codex/rules/1-naming.md",
        name: "1-naming",
        description: "Names",
      },
    ]);
  });

  it("reports a path relative to the project, never the machine it ran on", async () => {
    const useCase = new ListInstalledRulesUseCase(
      readerOf({ [at(".claude/rules/deep/nested/1-naming.md")]: "---\n---\n" })
    );

    const { rules } = await useCase.execute({ projectRoot: ROOT });

    expect(rules[0]?.path).toBe(".claude/rules/deep/nested/1-naming.md");
  });

  // The extension is the only thing separating a rule from a stray file beside it, and it
  // comes from the installer, never from a list written here.
  it("passes over a file whose extension is not the one that tool installs", async () => {
    const useCase = new ListInstalledRulesUseCase(
      readerOf({
        [at(".cursor/rules/1-naming.mdc")]: "---\n---\n",
        [at(".cursor/rules/README.md")]: "---\n---\n",
      })
    );

    const { rules } = await useCase.execute({ projectRoot: ROOT });

    expect(rules.map((rule) => rule.path)).toEqual([".cursor/rules/1-naming.mdc"]);
  });

  it("answers an empty list, never an error, for a project holding no rule at all", async () => {
    const useCase = new ListInstalledRulesUseCase(readerOf({}));

    await expect(useCase.execute({ projectRoot: ROOT })).resolves.toEqual({ rules: [] });
  });
});
