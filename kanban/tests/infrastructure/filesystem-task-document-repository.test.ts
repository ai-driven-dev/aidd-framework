import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FilesystemTaskDocumentRepository } from "../../src/infrastructure/filesystem/filesystem-task-document-repository.js";
import { DOCS_DIRECTORY_NAME } from "../helpers/docs-directory.js";

describe("FilesystemTaskDocumentRepository", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "aidd-kanban-"));
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it("returns one TaskDocument per markdown file with valid frontmatter", async () => {
    const aiddDocsPath = join(projectPath, DOCS_DIRECTORY_NAME);
    await mkdir(aiddDocsPath, { recursive: true });
    await writeFile(
      join(aiddDocsPath, "plan.md"),
      [
        "---",
        "name: FID-560",
        "description: a plan",
        "type: plan",
        "status: pending",
        "---",
        "",
        "# Plan",
      ].join("\n")
    );

    const repository = new FilesystemTaskDocumentRepository(DOCS_DIRECTORY_NAME);
    const taskDocuments = await repository.findAll(projectPath);

    expect(taskDocuments).toEqual([
      {
        name: "FID-560",
        description: "a plan",
        type: "plan",
        status: "pending",
        progressStatus: "todo",
        filePath: join(DOCS_DIRECTORY_NAME, "plan.md"),
      },
    ]);
  });

  it("buckets a document missing its status field as unknown instead of throwing", async () => {
    const aiddDocsPath = join(projectPath, DOCS_DIRECTORY_NAME);
    await mkdir(aiddDocsPath, { recursive: true });
    await writeFile(
      join(aiddDocsPath, "spec.md"),
      ["---", "name: SPEC-001", "description: a spec", "type: spec", "---", ""].join("\n")
    );

    const repository = new FilesystemTaskDocumentRepository(DOCS_DIRECTORY_NAME);
    const taskDocuments = await repository.findAll(projectPath);

    expect(taskDocuments).toHaveLength(1);
    expect(taskDocuments[0]?.status).toBe("unknown");
    expect(taskDocuments[0]?.progressStatus).toBe("unknown");
  });

  it("buckets a document with malformed YAML frontmatter as unknown without throwing", async () => {
    const aiddDocsPath = join(projectPath, DOCS_DIRECTORY_NAME);
    await mkdir(aiddDocsPath, { recursive: true });
    await writeFile(
      join(aiddDocsPath, "broken.md"),
      ["---", "name: [unterminated", "status: pending", "---", ""].join("\n")
    );

    const repository = new FilesystemTaskDocumentRepository(DOCS_DIRECTORY_NAME);
    const taskDocuments = await repository.findAll(projectPath);

    expect(taskDocuments).toHaveLength(1);
    expect(taskDocuments[0]?.type).toBe("unknown");
    expect(taskDocuments[0]?.status).toBe("unknown");
    expect(taskDocuments[0]?.progressStatus).toBe("unknown");
  });

  it("buckets a document with a non-string type field as unknown instead of passing the coerced value through", async () => {
    const aiddDocsPath = join(projectPath, DOCS_DIRECTORY_NAME);
    await mkdir(aiddDocsPath, { recursive: true });
    await writeFile(
      join(aiddDocsPath, "coerced-type.md"),
      [
        "---",
        "name: COERCED-TYPE",
        "description: a doc",
        "type: 2026",
        "status: pending",
        "---",
        "",
      ].join("\n")
    );

    const repository = new FilesystemTaskDocumentRepository(DOCS_DIRECTORY_NAME);
    const taskDocuments = await repository.findAll(projectPath);

    expect(taskDocuments).toHaveLength(1);
    expect(taskDocuments[0]?.type).toBe("unknown");
    expect(taskDocuments[0]?.status).toBe("pending");
    expect(taskDocuments[0]?.progressStatus).toBe("todo");
  });

  it("buckets a document with a non-string status field as unknown instead of passing the coerced Date through", async () => {
    const aiddDocsPath = join(projectPath, DOCS_DIRECTORY_NAME);
    await mkdir(aiddDocsPath, { recursive: true });
    await writeFile(
      join(aiddDocsPath, "coerced-status.md"),
      [
        "---",
        "name: COERCED-STATUS",
        "description: a doc",
        "type: plan",
        "status: 2026-07-19",
        "---",
        "",
      ].join("\n")
    );

    const repository = new FilesystemTaskDocumentRepository(DOCS_DIRECTORY_NAME);
    const taskDocuments = await repository.findAll(projectPath);

    expect(taskDocuments).toHaveLength(1);
    expect(taskDocuments[0]?.type).toBe("plan");
    expect(taskDocuments[0]?.status).toBe("unknown");
    expect(taskDocuments[0]?.progressStatus).toBe("unknown");
  });

  it("falls back to the filename without extension when the name field is missing", async () => {
    const aiddDocsPath = join(projectPath, DOCS_DIRECTORY_NAME);
    await mkdir(aiddDocsPath, { recursive: true });
    await writeFile(
      join(aiddDocsPath, "phase-1.md"),
      ["---", "description: a phase", "type: plan", "status: pending", "---", ""].join("\n")
    );

    const repository = new FilesystemTaskDocumentRepository(DOCS_DIRECTORY_NAME);
    const taskDocuments = await repository.findAll(projectPath);

    expect(taskDocuments).toHaveLength(1);
    expect(taskDocuments[0]?.name).toBe("phase-1");
  });

  it("falls back to the containing task folder's name when a plan.md has no name field", async () => {
    const taskFolderPath = join(
      projectPath,
      DOCS_DIRECTORY_NAME,
      "tasks",
      "2026_07",
      "2026_07_19_list-status-columns"
    );
    await mkdir(taskFolderPath, { recursive: true });
    await writeFile(
      join(taskFolderPath, "plan.md"),
      ["---", "status: pending", "---", ""].join("\n")
    );

    const repository = new FilesystemTaskDocumentRepository(DOCS_DIRECTORY_NAME);
    const taskDocuments = await repository.findAll(projectPath);

    expect(taskDocuments).toHaveLength(1);
    expect(taskDocuments[0]?.name).toBe("2026_07_19_list-status-columns");
  });

  it("resolves to an empty list when the project path has no aidd_docs directory", async () => {
    const repository = new FilesystemTaskDocumentRepository(DOCS_DIRECTORY_NAME);
    const taskDocuments = await repository.findAll(projectPath);

    expect(taskDocuments).toEqual([]);
  });

  it("reports projectExists true only when the docs directory is present", async () => {
    const repository = new FilesystemTaskDocumentRepository(DOCS_DIRECTORY_NAME);

    expect(await repository.projectExists(projectPath)).toBe(false);

    await mkdir(join(projectPath, DOCS_DIRECTORY_NAME), { recursive: true });

    expect(await repository.projectExists(projectPath)).toBe(true);
  });
});
