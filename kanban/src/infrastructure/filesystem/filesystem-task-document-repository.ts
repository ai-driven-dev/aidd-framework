import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeDocumentStatus } from "../../domain/models/document-status.js";
import { normalizeDocumentType } from "../../domain/models/document-type.js";
import { deriveProgressStatus } from "../../domain/models/progress-status.js";
import type { TaskDocument } from "../../domain/models/task-document.js";
import { resolveTaskDocumentNameFallback } from "../../domain/models/task-name-fallback.js";
import type { TaskDocumentRepository } from "../../domain/ports/task-document-repository.js";

type RawFrontmatter = Record<string, unknown>;

async function collectMarkdownFilePaths(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const markdownFilePaths: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      markdownFilePaths.push(...(await collectMarkdownFilePaths(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      markdownFilePaths.push(entryPath);
    }
  }

  return markdownFilePaths;
}

/**
 * The frontmatter parser loads on the first document read, not when this module does.
 *
 * The CLI that hosts kanban imports this repository to declare its commands, and every
 * invocation of that CLI would otherwise pay for `gray-matter` whether or not anyone
 * asked for a task view.
 */
type FrontmatterParser = (content: string) => { data: RawFrontmatter };
let loadParser: Promise<FrontmatterParser> | undefined;

async function parseFrontmatter(fileContent: string): Promise<RawFrontmatter> {
  loadParser ??= import("gray-matter").then((module) => module.default as FrontmatterParser);
  try {
    return (await loadParser)(fileContent).data;
  } catch {
    return {};
  }
}

function readStringField(frontmatter: RawFrontmatter, fieldName: string): string | undefined {
  const fieldValue = frontmatter[fieldName];

  return typeof fieldValue === "string" ? fieldValue : undefined;
}

function toTaskDocument(filePath: string, frontmatter: RawFrontmatter): TaskDocument {
  const status = normalizeDocumentStatus(readStringField(frontmatter, "status"));

  return {
    name: readStringField(frontmatter, "name") ?? resolveTaskDocumentNameFallback(filePath),
    description: readStringField(frontmatter, "description") ?? "",
    type: normalizeDocumentType(readStringField(frontmatter, "type")),
    status,
    progressStatus: deriveProgressStatus(status),
    filePath,
  };
}

export class FilesystemTaskDocumentRepository implements TaskDocumentRepository {
  constructor(private readonly docsDirectoryName: string) {}

  async findAll(projectPath: string): Promise<TaskDocument[]> {
    const aiddDocsPath = join(projectPath, this.docsDirectoryName);

    if (!existsSync(aiddDocsPath)) {
      return [];
    }

    const markdownFilePaths = await collectMarkdownFilePaths(aiddDocsPath);

    return Promise.all(
      markdownFilePaths.map(async (filePath) => {
        const fileContent = await readFile(filePath, "utf-8");
        const frontmatter = await parseFrontmatter(fileContent);

        return toTaskDocument(filePath, frontmatter);
      })
    );
  }
}
