import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOCS_DIRECTORY_NAME } from "../helpers/docs-directory.js";
import { createTestKanbanDeps } from "../helpers/test-deps.js";

const { renderMock } = vi.hoisted(() => ({ renderMock: vi.fn() }));

vi.mock("ink", async (importOriginal) => {
  const actualInkModule = await importOriginal<typeof import("ink")>();
  return { ...actualInkModule, render: renderMock };
});

vi.mock("../../src/infrastructure/http/frontend-assets.js", () => ({
  readFrontendAssets: () => ({ indexHtml: "<html></html>", stylesCss: "", appJs: "" }),
}));

const { registerKanban } = await import("../../src/presentation/register-kanban.js");

describe("register kanban", () => {
  let projectPath: string;
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "aidd-kanban-register-"));
    const taskDirectory = join(projectPath, DOCS_DIRECTORY_NAME, "task-a");
    await mkdir(taskDirectory, { recursive: true });
    await writeFile(
      join(taskDirectory, "plan.md"),
      ["---", "name: FID-560", "type: plan", "status: pending", "---", ""].join("\n")
    );
    originalCwd = process.cwd();
    renderMock.mockClear();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    process.chdir(originalCwd);
    await rm(projectPath, { recursive: true, force: true });
  });

  it("registers the list, web, and interactive subcommands on a bare command", () => {
    const program = new Command();

    registerKanban(program, createTestKanbanDeps());

    expect(program.commands.map((command) => command.name()).sort()).toEqual([
      "interactive",
      "list",
      "web",
    ]);
  });

  it("runs the list subcommand against the project path resolved once at registration", async () => {
    process.chdir(projectPath);
    const program = new Command();
    registerKanban(program, createTestKanbanDeps());

    await program.parseAsync(["node", "aidd-kanban", "list"]);

    const printed = consoleLogSpy.mock.calls[0]?.[0];
    expect(typeof printed === "string" ? printed : "").toContain("FID-560");
  });

  it("launches the interactive view for the default action", async () => {
    process.chdir(projectPath);
    const program = new Command();
    registerKanban(program, createTestKanbanDeps());

    await program.parseAsync(["node", "aidd-kanban"]);

    expect(renderMock).toHaveBeenCalledTimes(1);
  });
});
