import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import {
  type RestoreToolFilesOptions,
  RestoreToolFilesUseCase,
} from "../../../../../src/contexts/framework/application/restore/restore-tool-files-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import {
  CONFIG_VSCODE_EXTENSIONS,
  CONFIG_VSCODE_KEYBINDINGS,
} from "../../../../../src/contexts/tools/domain/capabilities/config-refs.js";
import { FrameworkDescriptor } from "../../../../../src/contexts/translate/domain/canon.js";
import { InstallationFile } from "../../../../../src/kernel/file.js";
import type { Prompter } from "../../../../../src/kernel/ports/prompter.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { FakePlatform } from "../../../../helpers/ports/fake-platform.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { KeepPrompter, OverwritePrompter } from "../../../../helpers/ports/scripted-prompter.js";

const PROJECT_ROOT = "/test-project";
const KEYBINDINGS = ".vscode/keybindings.json";
const EXTENSIONS = ".vscode/extensions.json";
const GHOST = ".vscode/ghost.json";
const KEYBINDINGS_CONTENT = '[{"key":"ctrl+k","command":"noop"}]';
const EXTENSIONS_CONTENT = '{"recommendations":["a.ext"]}';

const descriptor = new FrameworkDescriptor({
  version: "test",
  contentSections: [],
  templateRefs: [],
  configRefs: [
    { name: CONFIG_VSCODE_KEYBINDINGS, path: "config/vscode/keybindings.json" },
    { name: CONFIG_VSCODE_EXTENSIONS, path: "config/vscode/extensions.json" },
  ],
});

function contentFiles(extensions = EXTENSIONS_CONTENT): Map<string, string> {
  return new Map([
    ["config/vscode/keybindings.json", KEYBINDINGS_CONTENT],
    ["config/vscode/extensions.json", extensions],
  ]);
}

interface Installed {
  fs: InMemoryFileAdapter;
  hasher: DeterministicHasher;
  manifest: Manifest;
}

function installedVscode(extraTracked: string[] = []): Installed {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter(
    {
      [join(PROJECT_ROOT, KEYBINDINGS)]: KEYBINDINGS_CONTENT,
      [join(PROJECT_ROOT, EXTENSIONS)]: EXTENSIONS_CONTENT,
    },
    hasher
  );
  const manifest = Manifest.create();
  manifest.addTool(
    "vscode",
    "test",
    [KEYBINDINGS, ...extraTracked].map(
      (relativePath) =>
        new InstallationFile({
          relativePath,
          content: "",
          hash: hasher.hash(relativePath === KEYBINDINGS ? KEYBINDINGS_CONTENT : relativePath),
        })
    ),
    [
      {
        relativePath: EXTENSIONS,
        sectionKey: null,
        entries: { recommendations: hasher.hash(JSON.stringify(["a.ext"])) },
      },
    ]
  );
  return { fs, hasher, manifest };
}

function restore(
  installed: Installed,
  overrides: Partial<RestoreToolFilesOptions> = {},
  prompter: Prompter = new OverwritePrompter(),
  logger = new CapturingLogger()
) {
  return new RestoreToolFilesUseCase(
    installed.fs,
    installed.hasher,
    logger,
    new FakePlatform("linux"),
    prompter
  ).execute({
    toolId: "vscode",
    manifest: installed.manifest,
    descriptor,
    contentFiles: contentFiles(),
    projectRoot: PROJECT_ROOT,
    version: "test",
    force: true,
    interactive: false,
    fileFilter: null,
    ...overrides,
  });
}

describe("RestoreToolFilesUseCase — what it reports", () => {
  it("announces the tool it is checking", async () => {
    const installed = installedVscode();
    const logger = new CapturingLogger();

    await restore(installed, {}, new OverwritePrompter(), logger);

    expect(logger.infoMessages).toStrictEqual(["Checking vscode for files to restore..."]);
  });

  it("reports nothing to restore when every tracked file and key is intact", async () => {
    const result = await restore(installedVscode());

    expect(result).toStrictEqual({
      toolId: "vscode",
      nothingToRestore: true,
      restored: [],
      kept: [],
      unrestorable: [],
    });
  });

  it("lists what it restored and what it could not, across both sections", async () => {
    const installed = installedVscode([GHOST]);
    await installed.fs.writeFile(join(PROJECT_ROOT, KEYBINDINGS), "[]");
    await installed.fs.deleteFile(join(PROJECT_ROOT, EXTENSIONS));

    const result = await restore(installed);

    expect(result).toStrictEqual({
      toolId: "vscode",
      nothingToRestore: false,
      restored: [KEYBINDINGS, EXTENSIONS],
      kept: [],
      unrestorable: [GHOST],
    });
  });

  it("lists a modified file the user chose to keep", async () => {
    const installed = installedVscode();
    await installed.fs.writeFile(join(PROJECT_ROOT, KEYBINDINGS), "[]");

    const result = await restore(
      installed,
      { force: false, interactive: true },
      new KeepPrompter()
    );

    expect(result).toStrictEqual({
      toolId: "vscode",
      nothingToRestore: false,
      restored: [],
      kept: [KEYBINDINGS],
      unrestorable: [],
    });
  });
});

describe("RestoreToolFilesUseCase — what it records", () => {
  it("keeps the version the tool was installed at, not the one the restore runs with", async () => {
    const installed = installedVscode();
    await installed.fs.writeFile(join(PROJECT_ROOT, KEYBINDINGS), "[]");

    await restore(installed, { version: "9.9.9" });

    expect(installed.manifest.getToolVersion("vscode")).toBe("test");
  });

  it("keeps tracking the merge files when only a regular file was restored", async () => {
    const installed = installedVscode();
    const before = [...installed.manifest.getMergeFiles("vscode")];
    await installed.fs.writeFile(join(PROJECT_ROOT, KEYBINDINGS), "[]");

    await restore(installed);

    expect(installed.manifest.getMergeFiles("vscode")).toStrictEqual(before);
  });

  it("keeps tracking the regular files when only a merge file was restored", async () => {
    const installed = installedVscode();
    const before = [...installed.manifest.getToolFiles("vscode")];
    await installed.fs.deleteFile(join(PROJECT_ROOT, EXTENSIONS));

    await restore(installed);

    expect(installed.manifest.getToolFiles("vscode")).toStrictEqual(before);
  });

  it("tracks every key the distribution now writes into a restored merge file", async () => {
    const installed = installedVscode();
    await installed.fs.deleteFile(join(PROJECT_ROOT, EXTENSIONS));

    await restore(installed, {
      contentFiles: contentFiles(
        '{"recommendations":["a.ext"],"unwantedRecommendations":["b.ext"]}'
      ),
    });

    expect(installed.manifest.getMergeFiles("vscode")).toStrictEqual([
      {
        relativePath: EXTENSIONS,
        sectionKey: null,
        entries: {
          recommendations: installed.hasher.hash(JSON.stringify(["a.ext"])),
          unwantedRecommendations: installed.hasher.hash(JSON.stringify(["b.ext"])),
        },
      },
    ]);
  });
});
