import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TaskDocument } from "../../src/domain/models/task-document.js";
import { FilesystemTaskDocumentRepository } from "../../src/infrastructure/filesystem/filesystem-task-document-repository.js";
import { DOCS_DIRECTORY_NAME } from "../helpers/docs-directory.js";

const FIXTURES_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/frontmatter");

async function copyFixturesIntoAiddDocs(aiddDocsPath: string): Promise<void> {
  const fixtureFileNames = await readdir(FIXTURES_DIRECTORY);

  for (const fixtureFileName of fixtureFileNames) {
    const fixtureContent = await readFile(join(FIXTURES_DIRECTORY, fixtureFileName), "utf-8");
    await writeFile(join(aiddDocsPath, fixtureFileName), fixtureContent);
  }
}

function findByFileName(taskDocuments: TaskDocument[], fileName: string): TaskDocument {
  const taskDocument = taskDocuments.find((candidate) => candidate.filePath.endsWith(fileName));

  if (taskDocument === undefined) {
    throw new Error(`fixture ${fileName} did not parse into a TaskDocument`);
  }

  return taskDocument;
}

describe("fixture-verified frontmatter extraction", () => {
  let projectPath: string;
  let taskDocuments: TaskDocument[];

  beforeAll(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "aidd-kanban-frontmatter-"));
    const aiddDocsPath = join(projectPath, DOCS_DIRECTORY_NAME);
    await mkdir(aiddDocsPath, { recursive: true });
    await copyFixturesIntoAiddDocs(aiddDocsPath);

    const repository = new FilesystemTaskDocumentRepository(DOCS_DIRECTORY_NAME);
    taskDocuments = await repository.findAll(projectPath);
  });

  afterAll(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it("extracts the user's own example: fully-populated frontmatter", () => {
    const taskDocument = findByFileName(taskDocuments, "valid-full.md");

    expect(taskDocument.name).toBe("Test name");
    expect(taskDocument.type).toBe("plan");
    expect(taskDocument.status).toBe("completed");
  });

  it("extracts a status value the tool has no special case for, unaltered", () => {
    const taskDocument = findByFileName(taskDocuments, "unrecognized-status.md");

    expect(taskDocument.name).toBe("Unrecognized Status Document");
    expect(taskDocument.type).toBe("decision");
    expect(taskDocument.status).toBe("archived");
  });

  it("falls back to unknown type when the type key is absent", () => {
    const taskDocument = findByFileName(taskDocuments, "missing-type.md");

    expect(taskDocument.name).toBe("Missing Type Document");
    expect(taskDocument.type).toBe("unknown");
    expect(taskDocument.status).toBe("pending");
  });

  it("falls back to unknown status when the status key is absent", () => {
    const taskDocument = findByFileName(taskDocuments, "missing-status.md");

    expect(taskDocument.name).toBe("Missing Status Document");
    expect(taskDocument.type).toBe("spec");
    expect(taskDocument.status).toBe("unknown");
  });

  it("falls back to the filename and unknown type/status on malformed YAML frontmatter", () => {
    const taskDocument = findByFileName(taskDocuments, "malformed-yaml.md");

    expect(taskDocument.name).toBe("malformed-yaml");
    expect(taskDocument.type).toBe("unknown");
    expect(taskDocument.status).toBe("unknown");
  });

  it("extracts real frontmatter values unaffected by body text mentioning status/type", () => {
    const taskDocument = findByFileName(taskDocuments, "body-mentions-status-and-type.md");

    expect(taskDocument.name).toBe("Body Mentions Status And Type");
    expect(taskDocument.type).toBe("plan");
    expect(taskDocument.status).toBe("in-progress");
  });
});
