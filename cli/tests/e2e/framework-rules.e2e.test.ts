import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliPath, execFileAsync } from "./helpers.js";

/**
 * Run against the built binary, which is what the skill invokes: a use case passing in
 * isolation says nothing about the subcommand being reachable.
 */
describe("aidd framework rules — the inventory a rule scan reads", () => {
  let project: string;

  beforeAll(async () => {
    project = await mkdtemp(join(tmpdir(), "aidd-framework-rules-"));
    await mkdir(join(project, ".claude/rules/01-standards"), { recursive: true });
    await mkdir(join(project, ".codex/rules"), { recursive: true });
    await mkdir(join(project, ".cursor/rules"), { recursive: true });
    await writeFile(
      join(project, ".claude/rules/01-standards/1-naming.md"),
      '---\ndescription: Names files\npaths:\n  - "src/**/*.ts"\n---\n\n# Naming\n'
    );
    await writeFile(join(project, ".codex/rules/2-imports.md"), "---\n---\n\n# Imports\n");
    // Beside a rule, and not one: only the extension the tool installs makes it a rule.
    await writeFile(join(project, ".cursor/rules/README.md"), "# not a rule\n");
  });

  afterAll(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it("answers with every rule installed, whatever tool installed it", async () => {
    const { stdout } = await execFileAsync("node", [cliPath(), "framework", "rules", "--json"], {
      cwd: project,
    });

    expect(JSON.parse(stdout)).toEqual([
      {
        tool: "claude",
        path: ".claude/rules/01-standards/1-naming.md",
        name: "1-naming",
        description: "Names files",
        paths: ["src/**/*.ts"],
      },
      { tool: "codex", path: ".codex/rules/2-imports.md", name: "2-imports", description: "" },
    ]);
  });

  it("says a project holds none rather than printing nothing", async () => {
    const empty = await mkdtemp(join(tmpdir(), "aidd-framework-rules-empty-"));
    try {
      const { stdout } = await execFileAsync("node", [cliPath(), "framework", "rules"], {
        cwd: empty,
      });
      expect(stdout).toContain("No rules installed");
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
