import { join } from "node:path";
import { describe, expect, it } from "vitest";
// Side-effect imports: this use case asks the registry which tools have rules at all, so a
// tool that never registered is a tool it silently cannot see.
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import "../../../src/domain/tools/ai/copilot.js";
import "../../../src/domain/tools/ai/cursor.js";
import "../../../src/domain/tools/ai/opencode.js";
import { ListInstalledRulesUseCase } from "../../../src/application/use-cases/list-installed-rules-use-case.js";
import type { FileReader } from "../../../src/domain/ports/file-reader.js";

const ROOT = "/project";

/** A reader answering from a map of paths to content.
 *
 * Every member of the port is implemented, and the four this use case never calls reject
 * rather than return a placeholder: a stub answering `""` for a file nobody asked it about
 * would let a use case start reading through the wrong member and still look green. A
 * missing directory needs no branch — the real adapter answers an empty list for one it
 * cannot read, and so does this.
 */
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

  // The plugin script this replaced knew four directories and stated "Codex CLI: rules not
  // supported, skipped". `plugin-content-translator.ts` installs a plugin's `rules/` into
  // every tool whose capability accepts them, Codex included, so that answer was wrong and
  // silently so: a Codex project asking what rules it had was told none.
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

  // A tool's rules directory holds what that tool installs there and nothing else says it
  // is a rule. The extension is the only thing separating a Cursor rule from a stray file
  // beside it, and it comes from the installer, never from a list written here.
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
