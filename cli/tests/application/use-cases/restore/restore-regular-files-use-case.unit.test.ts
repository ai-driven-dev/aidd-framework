import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InputRequiredError } from "../../../../src/application/errors.js";
import { RestoreRegularFilesUseCase } from "../../../../src/application/use-cases/restore/restore-regular-files-use-case.js";
import { InstallationFile } from "../../../../src/domain/models/file.js";
import { buildUnitDeps } from "../../../helpers/ports/build-unit-deps.js";
import {
  KeepPrompter,
  OverwritePrompter,
  ScriptedPrompter,
} from "../../../helpers/ports/scripted-prompter.js";

const PROJECT_ROOT = "/test-project";

async function buildDeps() {
  return buildUnitDeps(PROJECT_ROOT);
}

describe("RestoreRegularFilesUseCase", () => {
  it("returns null when no manifest file has drifted", async () => {
    const deps = await buildDeps();
    await deps.fs.writeFile(join(PROJECT_ROOT, "a.md"), "current content");
    const useCase = new RestoreRegularFilesUseCase(deps.fs, new OverwritePrompter());

    const result = await useCase.execute({
      manifestFiles: [{ relativePath: "a.md", hash: deps.hasher.hash("current content") }],
      distMap: new Map(),
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: false,
      fileFilter: null,
    });

    expect(result).toBeNull();
  });

  it("restores a file deleted from disk, without prompting, even without force", async () => {
    const deps = await buildDeps();
    const useCase = new RestoreRegularFilesUseCase(deps.fs, new OverwritePrompter());
    const distMap = new Map([
      [
        "a.md",
        new InstallationFile({
          relativePath: "a.md",
          content: "framework content",
          hash: deps.hasher.hash("framework content"),
        }),
      ],
    ]);

    const result = await useCase.execute({
      manifestFiles: [{ relativePath: "a.md", hash: deps.hasher.hash("original content") }],
      distMap,
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: false,
      fileFilter: null,
    });

    expect(result).not.toBeNull();
    expect(result?.restored).toEqual(["a.md"]);
    expect(result?.kept).toEqual([]);
    expect(deps.fs.getFile(join(PROJECT_ROOT, "a.md"))).toBe("framework content");
    const updated = result?.updatedFiles.find((f) => f.relativePath === "a.md");
    expect(updated?.hash).toEqual(deps.hasher.hash("framework content"));
  });

  it("throws InputRequiredError for a modified file when force=false and interactive=false, without writing", async () => {
    const deps = await buildDeps();
    await deps.fs.writeFile(join(PROJECT_ROOT, "a.md"), "disk modified content");
    const useCase = new RestoreRegularFilesUseCase(deps.fs, new OverwritePrompter());
    const distMap = new Map([
      [
        "a.md",
        new InstallationFile({
          relativePath: "a.md",
          content: "framework content",
          hash: deps.hasher.hash("framework content"),
        }),
      ],
    ]);

    await expect(
      useCase.execute({
        manifestFiles: [{ relativePath: "a.md", hash: deps.hasher.hash("original content") }],
        distMap,
        projectRoot: PROJECT_ROOT,
        force: false,
        interactive: false,
        fileFilter: null,
      })
    ).rejects.toThrow(InputRequiredError);

    expect(deps.fs.getFile(join(PROJECT_ROOT, "a.md"))).toBe("disk modified content");
  });

  it("overwrites a modified file when force=true without prompting", async () => {
    const deps = await buildDeps();
    await deps.fs.writeFile(join(PROJECT_ROOT, "a.md"), "disk modified content");
    const useCase = new RestoreRegularFilesUseCase(deps.fs, new OverwritePrompter());
    const distMap = new Map([
      [
        "a.md",
        new InstallationFile({
          relativePath: "a.md",
          content: "framework content",
          hash: deps.hasher.hash("framework content"),
        }),
      ],
    ]);

    const result = await useCase.execute({
      manifestFiles: [{ relativePath: "a.md", hash: deps.hasher.hash("original content") }],
      distMap,
      projectRoot: PROJECT_ROOT,
      force: true,
      interactive: false,
      fileFilter: null,
    });

    expect(result?.restored).toEqual(["a.md"]);
    expect(deps.fs.getFile(join(PROJECT_ROOT, "a.md"))).toBe("framework content");
  });

  it("keeps a modified file when interactive=true and the prompter chooses keep", async () => {
    const deps = await buildDeps();
    await deps.fs.writeFile(join(PROJECT_ROOT, "a.md"), "disk modified content");
    const useCase = new RestoreRegularFilesUseCase(deps.fs, new KeepPrompter());
    const originalHash = deps.hasher.hash("original content");
    const distMap = new Map([
      [
        "a.md",
        new InstallationFile({
          relativePath: "a.md",
          content: "framework content",
          hash: deps.hasher.hash("framework content"),
        }),
      ],
    ]);

    const result = await useCase.execute({
      manifestFiles: [{ relativePath: "a.md", hash: originalHash }],
      distMap,
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: true,
      fileFilter: null,
    });

    expect(result?.kept).toEqual(["a.md"]);
    expect(result?.restored).toEqual([]);
    expect(deps.fs.getFile(join(PROJECT_ROOT, "a.md"))).toBe("disk modified content");
    const updated = result?.updatedFiles.find((f) => f.relativePath === "a.md");
    expect(updated?.hash).toEqual(originalHash);
  });

  it("overwrites a modified file when interactive=true and the prompter chooses overwrite", async () => {
    const deps = await buildDeps();
    await deps.fs.writeFile(join(PROJECT_ROOT, "a.md"), "disk modified content");
    const useCase = new RestoreRegularFilesUseCase(deps.fs, new OverwritePrompter());
    const distMap = new Map([
      [
        "a.md",
        new InstallationFile({
          relativePath: "a.md",
          content: "framework content",
          hash: deps.hasher.hash("framework content"),
        }),
      ],
    ]);

    const result = await useCase.execute({
      manifestFiles: [{ relativePath: "a.md", hash: deps.hasher.hash("original content") }],
      distMap,
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: true,
      fileFilter: null,
    });

    expect(result?.restored).toEqual(["a.md"]);
    expect(deps.fs.getFile(join(PROJECT_ROOT, "a.md"))).toBe("framework content");
  });

  it("excludes files that fail the fileFilter predicate from drift collection entirely", async () => {
    const deps = await buildDeps();
    await deps.fs.writeFile(join(PROJECT_ROOT, "a.md"), "disk modified content");
    const useCase = new RestoreRegularFilesUseCase(deps.fs, new OverwritePrompter());
    const distMap = new Map([
      [
        "a.md",
        new InstallationFile({
          relativePath: "a.md",
          content: "framework a",
          hash: deps.hasher.hash("framework a"),
        }),
      ],
      [
        "b.md",
        new InstallationFile({
          relativePath: "b.md",
          content: "framework b",
          hash: deps.hasher.hash("framework b"),
        }),
      ],
    ]);

    const result = await useCase.execute({
      manifestFiles: [
        { relativePath: "a.md", hash: deps.hasher.hash("original a") },
        { relativePath: "b.md", hash: deps.hasher.hash("original b") },
      ],
      distMap,
      projectRoot: PROJECT_ROOT,
      force: true,
      interactive: false,
      fileFilter: (relativePath) => relativePath === "a.md",
    });

    expect(result?.restored).toEqual(["a.md"]);
    expect(result?.kept).toEqual([]);
    expect(deps.fs.has(join(PROJECT_ROOT, "b.md"))).toBe(false);
  });

  it("partitions multiple drifted files into restored and kept within a single call", async () => {
    const deps = await buildDeps();
    await deps.fs.writeFile(join(PROJECT_ROOT, "a.md"), "disk modified a");
    await deps.fs.writeFile(join(PROJECT_ROOT, "b.md"), "disk modified b");
    const prompter = new ScriptedPrompter([
      ScriptedPrompter.answer.conflict("overwrite"),
      ScriptedPrompter.answer.conflict("keep"),
    ]);
    const useCase = new RestoreRegularFilesUseCase(deps.fs, prompter);
    const distMap = new Map([
      [
        "a.md",
        new InstallationFile({
          relativePath: "a.md",
          content: "framework a",
          hash: deps.hasher.hash("framework a"),
        }),
      ],
      [
        "b.md",
        new InstallationFile({
          relativePath: "b.md",
          content: "framework b",
          hash: deps.hasher.hash("framework b"),
        }),
      ],
    ]);

    const result = await useCase.execute({
      manifestFiles: [
        { relativePath: "a.md", hash: deps.hasher.hash("original a") },
        { relativePath: "b.md", hash: deps.hasher.hash("original b") },
      ],
      distMap,
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: true,
      fileFilter: null,
    });

    expect(result?.restored).toEqual(["a.md"]);
    expect(result?.kept).toEqual(["b.md"]);
    expect(deps.fs.getFile(join(PROJECT_ROOT, "a.md"))).toBe("framework a");
    expect(deps.fs.getFile(join(PROJECT_ROOT, "b.md"))).toBe("disk modified b");
  });

  it("reports a deleted file with no corresponding dist entry as unrestorable, without touching disk", async () => {
    const deps = await buildDeps();
    const useCase = new RestoreRegularFilesUseCase(deps.fs, new OverwritePrompter());

    const result = await useCase.execute({
      manifestFiles: [{ relativePath: "a.md", hash: deps.hasher.hash("original content") }],
      distMap: new Map(),
      projectRoot: PROJECT_ROOT,
      force: true,
      interactive: false,
      fileFilter: null,
    });

    expect(result?.unrestorable).toEqual(["a.md"]);
    expect(result?.restored).toEqual([]);
    expect(result?.kept).toEqual([]);
    expect(deps.fs.has(join(PROJECT_ROOT, "a.md"))).toBe(false);
  });

  it("reports a modified file with no corresponding dist entry as unrestorable, without touching disk", async () => {
    const deps = await buildDeps();
    await deps.fs.writeFile(join(PROJECT_ROOT, "a.md"), "disk modified content");
    const useCase = new RestoreRegularFilesUseCase(deps.fs, new OverwritePrompter());

    const result = await useCase.execute({
      manifestFiles: [{ relativePath: "a.md", hash: deps.hasher.hash("original content") }],
      distMap: new Map(),
      projectRoot: PROJECT_ROOT,
      force: true,
      interactive: false,
      fileFilter: null,
    });

    expect(result?.unrestorable).toEqual(["a.md"]);
    expect(result?.restored).toEqual([]);
    expect(result?.kept).toEqual([]);
    expect(deps.fs.getFile(join(PROJECT_ROOT, "a.md"))).toBe("disk modified content");
  });
});
