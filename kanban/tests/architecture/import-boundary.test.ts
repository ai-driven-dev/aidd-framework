import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "../../src");

const INFRASTRUCTURE_IMPORT = /from\s+"[^"]*infrastructure\//;

const ALLOWED_INFRASTRUCTURE_IMPORTERS = ["composition/kanban-runtime.ts"];

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function toPosixRelativePath(absolutePath: string): string {
  return relative(SOURCE_DIRECTORY, absolutePath).split(sep).join("/");
}

describe("infrastructure import boundary", () => {
  it("keeps infrastructure imports inside the composition root", () => {
    const importers = listSourceFiles(SOURCE_DIRECTORY)
      .filter((filePath) => INFRASTRUCTURE_IMPORT.test(readFileSync(filePath, "utf-8")))
      .map(toPosixRelativePath)
      .sort();

    expect(importers).toEqual(ALLOWED_INFRASTRUCTURE_IMPORTERS);
  });
});
