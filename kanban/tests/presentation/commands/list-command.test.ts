import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKanbanRuntime } from "../../../src/composition/kanban-runtime.js";
import { registerListCommand } from "../../../src/presentation/commands/list-command.js";
import { DOCS_DIRECTORY_NAME } from "../../helpers/docs-directory.js";
import { createTestKanbanDeps } from "../../helpers/test-deps.js";

const FIXTURES_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/frontmatter"
);

async function writeTaskDocument(
  directoryPath: string,
  fileName: string,
  frontmatterLines: string[]
): Promise<void> {
  await mkdir(directoryPath, { recursive: true });
  await writeFile(
    join(directoryPath, fileName),
    ["---", ...frontmatterLines, "---", ""].join("\n")
  );
}

function createProgram(): Command {
  const program = new Command();
  const deps = createTestKanbanDeps();
  const runtime = createKanbanRuntime({ deps, projectPath: process.cwd() });
  registerListCommand(program, runtime, deps.onError);
  return program;
}

function printedTable(consoleLogSpy: ReturnType<typeof vi.spyOn>): string {
  const printedCall = consoleLogSpy.mock.calls[0];
  return typeof printedCall?.[0] === "string" ? printedCall[0] : "";
}

const ESCAPE_CHARACTER_CODE = 27;
const ANSI_SGR_PATTERN = new RegExp(
  `${String.fromCharCode(ESCAPE_CHARACTER_CODE)}\\[[0-9;]*m`,
  "g"
);

function stripAnsi(value: string): string {
  return value.replace(ANSI_SGR_PATTERN, "");
}

describe("list command", () => {
  let projectPath: string;
  let aiddDocsPath: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let originalCwd: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "aidd-kanban-list-"));
    aiddDocsPath = join(projectPath, DOCS_DIRECTORY_NAME);
    await mkdir(aiddDocsPath, { recursive: true });
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    process.chdir(originalCwd);
    await rm(projectPath, { recursive: true, force: true });
  });

  it("renders the fixed board columns, each parent under its normalized bucket", async () => {
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "plan.md", [
      "name: FID-560",
      "type: plan",
      "status: pending",
    ]);
    await writeTaskDocument(join(aiddDocsPath, "task-b"), "spec.md", [
      "name: SPEC-001",
      "type: spec",
      "status: completed",
    ]);

    await createProgram().parseAsync(["node", "aidd-kanban", "list", projectPath]);

    const table = printedTable(consoleLogSpy);
    expect(table).toContain("TODO");
    expect(table).toContain("UNKNOWN");
    expect(table).toContain("FID-560");
    expect(table).toContain("SPEC-001");
  });

  it("nests a parent's sub-documents in the same column, showing their own status as plain text", async () => {
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "plan.md", [
      "name: FID-560",
      "type: plan",
      "status: pending",
    ]);
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "phase-1.md", [
      "name: Phase 1",
      "status: blocked",
    ]);

    await createProgram().parseAsync(["node", "aidd-kanban", "list", projectPath]);

    const table = printedTable(consoleLogSpy);
    expect(table).toContain("FID-560");
    expect(table).toContain("- Phase 1: blocked");
  });

  it("never moves the parent into a different column because of a sub-document's own status", async () => {
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "plan.md", [
      "name: FID-560",
      "type: plan",
      "status: pending",
    ]);
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "phase-1.md", [
      "name: Phase 1",
      "status: done",
    ]);

    await createProgram().parseAsync(["node", "aidd-kanban", "list", projectPath]);

    const table = printedTable(consoleLogSpy);
    const linesMentioningDone = table.split("\n").filter((line) => line.includes(": done"));
    expect(linesMentioningDone).toHaveLength(1);
    expect(linesMentioningDone[0]).toContain("Phase 1");
    expect(table).toContain("TODO");
  });

  it("produces a bounded-width table when process.stdout.columns is unavailable (non-TTY)", async () => {
    const originalColumns = process.stdout.columns;
    Object.defineProperty(process.stdout, "columns", { value: undefined, configurable: true });

    try {
      const longName = "A".repeat(300);
      await writeTaskDocument(join(aiddDocsPath, "task-a"), "plan.md", [
        `name: ${longName}`,
        "type: plan",
        "status: pending",
      ]);

      await expect(
        createProgram().parseAsync(["node", "aidd-kanban", "list", projectPath])
      ).resolves.not.toThrow();

      const table = stripAnsi(printedTable(consoleLogSpy));
      const longestLine = Math.max(...table.split("\n").map((line) => line.length));
      expect(longestLine).toBeLessThan(200);
    } finally {
      Object.defineProperty(process.stdout, "columns", {
        value: originalColumns,
        configurable: true,
      });
    }
  });

  it("filters rows by --type", async () => {
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "plan.md", [
      "name: FID-560",
      "type: plan",
      "status: pending",
    ]);
    await writeTaskDocument(join(aiddDocsPath, "task-b"), "decision.md", [
      "name: DEC-001",
      "type: decision",
      "status: blocked",
    ]);

    await createProgram().parseAsync([
      "node",
      "aidd-kanban",
      "list",
      projectPath,
      "--type",
      "plan",
    ]);

    const table = printedTable(consoleLogSpy);
    expect(table).toContain("FID-560");
    expect(table).not.toContain("DEC-001");
  });

  it("filters rows by --status", async () => {
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "plan.md", [
      "name: FID-560",
      "type: plan",
      "status: pending",
    ]);
    await writeTaskDocument(join(aiddDocsPath, "task-b"), "decision.md", [
      "name: DEC-001",
      "type: decision",
      "status: blocked",
    ]);

    await createProgram().parseAsync([
      "node",
      "aidd-kanban",
      "list",
      projectPath,
      "--status",
      "blocked",
    ]);

    const table = printedTable(consoleLogSpy);
    expect(table).not.toContain("FID-560");
    expect(table).toContain("DEC-001");
  });

  it("filters rows by --progress independently of --type and --status", async () => {
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "plan.md", [
      "name: FID-560",
      "type: plan",
      "status: pending",
    ]);
    await writeTaskDocument(join(aiddDocsPath, "task-b"), "spec.md", [
      "name: SPEC-001",
      "type: spec",
      "status: implemented",
    ]);

    await createProgram().parseAsync([
      "node",
      "aidd-kanban",
      "list",
      projectPath,
      "--progress",
      "done",
    ]);

    const table = printedTable(consoleLogSpy);
    expect(table).toContain("SPEC-001");
    expect(table).not.toContain("FID-560");
  });

  it("targets the current working directory when no path argument is given", async () => {
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "plan.md", [
      "name: FID-560",
      "type: plan",
      "status: pending",
    ]);
    process.chdir(projectPath);

    await createProgram().parseAsync(["node", "aidd-kanban", "list"]);

    const table = printedTable(consoleLogSpy);
    expect(table).toContain("FID-560");
  });

  it("hides a document missing its status field by default", async () => {
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "spec.md", [
      "name: SPEC-001",
      "type: spec",
    ]);

    await createProgram().parseAsync(["node", "aidd-kanban", "list", projectPath]);

    const table = printedTable(consoleLogSpy);
    expect(table).not.toContain("unknown");
    expect(table).not.toContain("SPEC-001");
  });

  it("shows a document missing its status field under the unknown column when --all is given", async () => {
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "spec.md", [
      "name: SPEC-001",
      "type: spec",
    ]);

    await createProgram().parseAsync(["node", "aidd-kanban", "list", projectPath, "--all"]);

    const table = printedTable(consoleLogSpy);
    expect(table).toContain("UNKNOWN");
    expect(table).toContain("SPEC-001");
  });

  it("end-to-end: a fixture document's name reaches the table, its unmapped status landing under UNKNOWN", async () => {
    const fixtureContent = await readFile(join(FIXTURES_DIRECTORY, "valid-full.md"), "utf-8");
    await mkdir(join(aiddDocsPath, "task-fixture"), { recursive: true });
    await writeFile(join(aiddDocsPath, "task-fixture", "plan.md"), fixtureContent);

    await createProgram().parseAsync(["node", "aidd-kanban", "list", projectPath]);

    const table = printedTable(consoleLogSpy);
    expect(table).toContain("Test name");
    expect(table).toContain("UNKNOWN");
  });
});
