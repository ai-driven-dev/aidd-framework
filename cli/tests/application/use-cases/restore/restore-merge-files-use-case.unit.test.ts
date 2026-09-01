import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InputRequiredError } from "../../../../src/application/errors.js";
import { RestoreMergeFilesUseCase } from "../../../../src/application/use-cases/restore/restore-merge-files-use-case.js";
import { InstallationFile } from "../../../../src/kernel/file.js";
import type { MergeFileEntry } from "../../../../src/kernel/merge.js";
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

describe("RestoreMergeFilesUseCase", () => {
  it("returns null when no merge file has drifted", async () => {
    const deps = await buildDeps();
    const settingsPath = join(PROJECT_ROOT, "settings.json");
    await deps.fs.writeFile(settingsPath, JSON.stringify({ a: "1" }));
    const useCase = new RestoreMergeFilesUseCase(deps.fs, deps.hasher, new OverwritePrompter());

    const result = await useCase.execute({
      mergeFiles: [
        {
          relativePath: "settings.json",
          sectionKey: null,
          entries: { a: deps.hasher.hash(JSON.stringify("1")) },
        },
      ],
      distMap: new Map([
        [
          "settings.json",
          new InstallationFile({
            relativePath: "settings.json",
            content: JSON.stringify({ a: "1" }),
            hash: deps.hasher.hash(JSON.stringify({ a: "1" })),
            mergeStrategy: "framework-prime",
          }),
        ],
      ]),
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: false,
      fileFilter: null,
    });

    expect(result).toBeNull();
  });

  it("recreates a merge file deleted from disk, without prompting, even without force", async () => {
    const deps = await buildDeps();
    const useCase = new RestoreMergeFilesUseCase(deps.fs, deps.hasher, new OverwritePrompter());
    const distContent = JSON.stringify({ a: "framework-a" });

    const result = await useCase.execute({
      mergeFiles: [
        {
          relativePath: "settings.json",
          sectionKey: null,
          entries: { a: deps.hasher.hash(JSON.stringify("original-a")) },
        },
      ],
      distMap: new Map([
        [
          "settings.json",
          new InstallationFile({
            relativePath: "settings.json",
            content: distContent,
            hash: deps.hasher.hash(distContent),
            mergeStrategy: "framework-prime",
          }),
        ],
      ]),
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: false,
      fileFilter: null,
    });

    expect(result?.restored).toEqual(["settings.json"]);
    expect(result?.kept).toEqual([]);
    const content = deps.fs.getFile(join(PROJECT_ROOT, "settings.json"));
    expect(content && JSON.parse(content)).toEqual({ a: "framework-a" });
  });

  it("throws InputRequiredError for a modified merge file when force=false and interactive=false, without writing", async () => {
    const deps = await buildDeps();
    const settingsPath = join(PROJECT_ROOT, "settings.json");
    await deps.fs.writeFile(settingsPath, JSON.stringify({ a: "disk-modified" }));
    const useCase = new RestoreMergeFilesUseCase(deps.fs, deps.hasher, new OverwritePrompter());
    const distContent = JSON.stringify({ a: "framework-a" });

    await expect(
      useCase.execute({
        mergeFiles: [
          {
            relativePath: "settings.json",
            sectionKey: null,
            entries: { a: deps.hasher.hash(JSON.stringify("original-a")) },
          },
        ],
        distMap: new Map([
          [
            "settings.json",
            new InstallationFile({
              relativePath: "settings.json",
              content: distContent,
              hash: deps.hasher.hash(distContent),
              mergeStrategy: "framework-prime",
            }),
          ],
        ]),
        projectRoot: PROJECT_ROOT,
        force: false,
        interactive: false,
        fileFilter: null,
      })
    ).rejects.toThrow(InputRequiredError);

    expect(deps.fs.getFile(settingsPath)).toBe(JSON.stringify({ a: "disk-modified" }));
  });

  it("keeps a modified merge file when interactive=true and the prompter chooses keep", async () => {
    const deps = await buildDeps();
    const settingsPath = join(PROJECT_ROOT, "settings.json");
    await deps.fs.writeFile(settingsPath, JSON.stringify({ a: "disk-modified" }));
    const useCase = new RestoreMergeFilesUseCase(deps.fs, deps.hasher, new KeepPrompter());
    const distContent = JSON.stringify({ a: "framework-a" });

    const result = await useCase.execute({
      mergeFiles: [
        {
          relativePath: "settings.json",
          sectionKey: null,
          entries: { a: deps.hasher.hash(JSON.stringify("original-a")) },
        },
      ],
      distMap: new Map([
        [
          "settings.json",
          new InstallationFile({
            relativePath: "settings.json",
            content: distContent,
            hash: deps.hasher.hash(distContent),
            mergeStrategy: "framework-prime",
          }),
        ],
      ]),
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: true,
      fileFilter: null,
    });

    expect(result?.kept).toEqual(["settings.json"]);
    expect(result?.restored).toEqual([]);
    expect(deps.fs.getFile(settingsPath)).toBe(JSON.stringify({ a: "disk-modified" }));
  });

  it("excludes merge files that fail the fileFilter predicate from drift collection entirely", async () => {
    const deps = await buildDeps();
    await deps.fs.writeFile(join(PROJECT_ROOT, "a.json"), JSON.stringify({ x: "disk" }));
    await deps.fs.writeFile(join(PROJECT_ROOT, "b.json"), JSON.stringify({ x: "disk" }));
    const useCase = new RestoreMergeFilesUseCase(deps.fs, deps.hasher, new OverwritePrompter());
    const distContent = JSON.stringify({ x: "framework" });
    const mergeFiles: MergeFileEntry[] = [
      { relativePath: "a.json", sectionKey: null, entries: { x: deps.hasher.hash('"orig"') } },
      { relativePath: "b.json", sectionKey: null, entries: { x: deps.hasher.hash('"orig"') } },
    ];

    const result = await useCase.execute({
      mergeFiles,
      distMap: new Map([
        [
          "a.json",
          new InstallationFile({
            relativePath: "a.json",
            content: distContent,
            hash: deps.hasher.hash(distContent),
            mergeStrategy: "framework-prime",
          }),
        ],
        [
          "b.json",
          new InstallationFile({
            relativePath: "b.json",
            content: distContent,
            hash: deps.hasher.hash(distContent),
            mergeStrategy: "framework-prime",
          }),
        ],
      ]),
      projectRoot: PROJECT_ROOT,
      force: true,
      interactive: false,
      fileFilter: (relativePath) => relativePath === "a.json",
    });

    expect(result?.restored).toEqual(["a.json"]);
    expect(deps.fs.getFile(join(PROJECT_ROOT, "b.json"))).toBe(JSON.stringify({ x: "disk" }));
  });

  it("reports a drifted merge file as unrestorable when the distribution strategy is 'none'", async () => {
    const deps = await buildDeps();
    await deps.fs.writeFile(join(PROJECT_ROOT, "a.json"), JSON.stringify({ x: "disk" }));
    const useCase = new RestoreMergeFilesUseCase(deps.fs, deps.hasher, new OverwritePrompter());

    const result = await useCase.execute({
      mergeFiles: [
        { relativePath: "a.json", sectionKey: null, entries: { x: deps.hasher.hash('"orig"') } },
      ],
      distMap: new Map([
        [
          "a.json",
          new InstallationFile({
            relativePath: "a.json",
            content: JSON.stringify({ x: "framework" }),
            hash: deps.hasher.hash(JSON.stringify({ x: "framework" })),
            mergeStrategy: "none",
          }),
        ],
      ]),
      projectRoot: PROJECT_ROOT,
      force: true,
      interactive: false,
      fileFilter: null,
    });

    expect(result?.unrestorable).toEqual(["a.json"]);
    expect(result?.restored).toEqual([]);
    expect(result?.kept).toEqual([]);
    expect(deps.fs.getFile(join(PROJECT_ROOT, "a.json"))).toBe(JSON.stringify({ x: "disk" }));
  });

  it("returns null when a merge file's distribution strategy is 'none' and nothing drifted", async () => {
    const deps = await buildDeps();
    const distContent = JSON.stringify({ x: "framework" });
    await deps.fs.writeFile(join(PROJECT_ROOT, "a.json"), distContent);
    const useCase = new RestoreMergeFilesUseCase(deps.fs, deps.hasher, new OverwritePrompter());

    const result = await useCase.execute({
      mergeFiles: [
        {
          relativePath: "a.json",
          sectionKey: null,
          entries: { x: deps.hasher.hash('"framework"') },
        },
      ],
      distMap: new Map([
        [
          "a.json",
          new InstallationFile({
            relativePath: "a.json",
            content: distContent,
            hash: deps.hasher.hash(distContent),
            mergeStrategy: "none",
          }),
        ],
      ]),
      projectRoot: PROJECT_ROOT,
      force: true,
      interactive: false,
      fileFilter: null,
    });

    expect(result).toBeNull();
  });

  it("partitions multiple drifted merge files into restored and kept within a single call", async () => {
    const deps = await buildDeps();
    await deps.fs.writeFile(join(PROJECT_ROOT, "a.json"), JSON.stringify({ x: "disk-a" }));
    await deps.fs.writeFile(join(PROJECT_ROOT, "b.json"), JSON.stringify({ x: "disk-b" }));
    const prompter = new ScriptedPrompter([
      ScriptedPrompter.answer.conflict("overwrite"),
      ScriptedPrompter.answer.conflict("keep"),
    ]);
    const useCase = new RestoreMergeFilesUseCase(deps.fs, deps.hasher, prompter);
    const distContentA = JSON.stringify({ x: "framework-a" });
    const distContentB = JSON.stringify({ x: "framework-b" });

    const result = await useCase.execute({
      mergeFiles: [
        { relativePath: "a.json", sectionKey: null, entries: { x: deps.hasher.hash('"orig-a"') } },
        { relativePath: "b.json", sectionKey: null, entries: { x: deps.hasher.hash('"orig-b"') } },
      ],
      distMap: new Map([
        [
          "a.json",
          new InstallationFile({
            relativePath: "a.json",
            content: distContentA,
            hash: deps.hasher.hash(distContentA),
            mergeStrategy: "framework-prime",
          }),
        ],
        [
          "b.json",
          new InstallationFile({
            relativePath: "b.json",
            content: distContentB,
            hash: deps.hasher.hash(distContentB),
            mergeStrategy: "framework-prime",
          }),
        ],
      ]),
      projectRoot: PROJECT_ROOT,
      force: false,
      interactive: true,
      fileFilter: null,
    });

    expect(result?.restored).toEqual(["a.json"]);
    expect(result?.kept).toEqual(["b.json"]);
    expect(deps.fs.getFile(join(PROJECT_ROOT, "b.json"))).toBe(JSON.stringify({ x: "disk-b" }));
  });

  it("merges only the drifted tracked key, leaving an undrifted tracked key and an untracked key untouched", async () => {
    const deps = await buildDeps();
    const configPath = join(PROJECT_ROOT, "config.json");
    // On disk: toolPath drifted away from what the manifest recorded; timeout still
    // matches; sideNote is a user key the framework distribution never mentions at all.
    await deps.fs.writeFile(
      configPath,
      JSON.stringify({ toolPath: "/usr/local/old-tool", timeout: 30, sideNote: "keep-me" })
    );
    const useCase = new RestoreMergeFilesUseCase(deps.fs, deps.hasher, new OverwritePrompter());
    // The framework distribution only ever manages toolPath and timeout — sideNote
    // never appears in it, proving a merge restore cannot behave as a whole-file replace.
    const distContent = JSON.stringify({ toolPath: "/usr/local/new-tool", timeout: 30 });

    const result = await useCase.execute({
      mergeFiles: [
        {
          relativePath: "config.json",
          sectionKey: null,
          entries: {
            toolPath: deps.hasher.hash(JSON.stringify("/usr/local/expected-tool")),
            timeout: deps.hasher.hash(JSON.stringify(30)),
          },
        },
      ],
      distMap: new Map([
        [
          "config.json",
          new InstallationFile({
            relativePath: "config.json",
            content: distContent,
            hash: deps.hasher.hash(distContent),
            // toolPath is framework-owned and always synced; timeout defaults to
            // user-prime, so an undrifted value on disk is left exactly as-is.
            mergeStrategy: { default: "user-prime", frameworkOverrideKeys: ["toolPath"] },
          }),
        ],
      ]),
      projectRoot: PROJECT_ROOT,
      force: true,
      interactive: false,
      fileFilter: null,
    });

    expect(result?.restored).toEqual(["config.json"]);
    const content = deps.fs.getFile(configPath);
    expect(content && JSON.parse(content)).toEqual({
      toolPath: "/usr/local/new-tool",
      timeout: 30,
      sideNote: "keep-me",
    });
  });
});
