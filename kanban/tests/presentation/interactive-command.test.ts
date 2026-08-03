import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusColumnsView } from "../../src/presentation/components/status-columns-view.js";
import { DOCS_DIRECTORY_NAME } from "../helpers/docs-directory.js";
import { createTestKanbanDeps } from "../helpers/test-deps.js";

const { renderMock } = vi.hoisted(() => ({ renderMock: vi.fn() }));

vi.mock("ink", async (importOriginal) => {
  const actualInkModule = await importOriginal<typeof import("ink")>();
  return { ...actualInkModule, render: renderMock };
});

const { registerInteractiveCommand } = await import(
  "../../src/presentation/commands/interactive-command.js"
);
const { registerListCommand } = await import("../../src/presentation/commands/list-command.js");

function createProgram(): Command {
  const program = new Command();
  const deps = createTestKanbanDeps();
  registerInteractiveCommand(program, deps);
  registerListCommand(program, deps);
  return program;
}

describe("interactive command wiring", () => {
  let projectPath: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "aidd-kanban-interactive-command-"));
    await mkdir(join(projectPath, DOCS_DIRECTORY_NAME), { recursive: true });
    renderMock.mockClear();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    await rm(projectPath, { recursive: true, force: true });
  });

  it("launches the interactive view when no subcommand is given", async () => {
    await createProgram().parseAsync(["node", "aidd-kanban", projectPath]);

    expect(renderMock).toHaveBeenCalledTimes(1);

    const [renderedElement] = renderMock.mock.calls[0] as [ReactElement];
    expect(renderedElement.type).toBe(StatusColumnsView);
    expect((renderedElement.props as { projectPath: string }).projectPath).toBe(projectPath);
  });

  it("wires --all into shouldIncludeUnknownStatus for the interactive view", async () => {
    await createProgram().parseAsync(["node", "aidd-kanban", projectPath, "--all"]);

    const [renderedElement] = renderMock.mock.calls[0] as [ReactElement];
    expect(
      (renderedElement.props as { filters: { shouldIncludeUnknownStatus?: boolean } }).filters
        .shouldIncludeUnknownStatus
    ).toBe(true);
  });

  it("still produces the export when the list subcommand is given", async () => {
    await writeFile(
      join(projectPath, DOCS_DIRECTORY_NAME, "plan.md"),
      ["---", "name: FID-560", "type: plan", "status: pending", "---", ""].join("\n")
    );

    await createProgram().parseAsync(["node", "aidd-kanban", "list", projectPath]);

    expect(renderMock).not.toHaveBeenCalled();
    const printedCall = consoleLogSpy.mock.calls[0];
    const table = typeof printedCall?.[0] === "string" ? printedCall[0] : "";
    expect(table).toContain("FID-560");
  });
});
