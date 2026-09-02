import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilesystemTaskDocumentWatcher } from "../../src/infrastructure/filesystem/filesystem-task-document-watcher.js";
import { DOCS_DIRECTORY_NAME } from "../helpers/docs-directory.js";

function waitForCallback(watcher: FilesystemTaskDocumentWatcher, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("onChange not called within timeout")),
      timeoutMs
    );
    watcher.onChange(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe("FilesystemTaskDocumentWatcher", () => {
  let projectPath: string;
  let watcher: FilesystemTaskDocumentWatcher;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "aidd-watcher-"));
  });

  afterEach(async () => {
    watcher?.stop();
    await rm(projectPath, { recursive: true, force: true });
  });

  it("fires onChange when a markdown file is written", async () => {
    const docsPath = join(projectPath, DOCS_DIRECTORY_NAME, "tasks", "feature");
    await mkdir(docsPath, { recursive: true });

    watcher = new FilesystemTaskDocumentWatcher(DOCS_DIRECTORY_NAME);

    const callbackPromise = waitForCallback(watcher);
    watcher.start(projectPath);

    await writeFile(join(docsPath, "plan.md"), "---\nstatus: pending\n---\n# Plan");

    await callbackPromise;
  });

  it("fires onChange when a file is modified", async () => {
    const docsPath = join(projectPath, DOCS_DIRECTORY_NAME, "tasks", "feature");
    await mkdir(docsPath, { recursive: true });
    await writeFile(join(docsPath, "plan.md"), "---\nstatus: pending\n---\n# Plan");

    watcher = new FilesystemTaskDocumentWatcher(DOCS_DIRECTORY_NAME);

    const callbackPromise = waitForCallback(watcher);
    watcher.start(projectPath);

    await writeFile(join(docsPath, "plan.md"), "---\nstatus: in-progress\n---\n# Plan");

    await callbackPromise;
  });

  it("debounces rapid changes into a single callback", async () => {
    const docsPath = join(projectPath, DOCS_DIRECTORY_NAME, "tasks", "feature");
    await mkdir(docsPath, { recursive: true });

    watcher = new FilesystemTaskDocumentWatcher(DOCS_DIRECTORY_NAME);

    const callback = vi.fn();
    watcher.onChange(callback);
    watcher.start(projectPath);

    await writeFile(join(docsPath, "a.md"), "---\nstatus: pending\n---\n");
    await writeFile(join(docsPath, "b.md"), "---\nstatus: pending\n---\n");
    await writeFile(join(docsPath, "c.md"), "---\nstatus: pending\n---\n");

    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not fire after stop is called", async () => {
    const docsPath = join(projectPath, DOCS_DIRECTORY_NAME, "tasks", "feature");
    await mkdir(docsPath, { recursive: true });

    watcher = new FilesystemTaskDocumentWatcher(DOCS_DIRECTORY_NAME);

    const callback = vi.fn();
    watcher.onChange(callback);
    watcher.start(projectPath);
    watcher.stop();

    await writeFile(join(docsPath, "plan.md"), "---\nstatus: pending\n---\n# Plan");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(callback).not.toHaveBeenCalled();
  });

  it("does nothing when the docs directory does not exist", () => {
    watcher = new FilesystemTaskDocumentWatcher(DOCS_DIRECTORY_NAME);

    expect(() => watcher.start(projectPath)).not.toThrow();
    watcher.stop();
  });

  it("follows the callback to the new directory after retarget and drops the old one", async () => {
    const firstProject = await mkdtemp(join(tmpdir(), "aidd-watcher-a-"));
    const secondProject = await mkdtemp(join(tmpdir(), "aidd-watcher-b-"));
    const firstDocs = join(firstProject, DOCS_DIRECTORY_NAME, "tasks");
    const secondDocs = join(secondProject, DOCS_DIRECTORY_NAME, "tasks");
    await mkdir(firstDocs, { recursive: true });
    await mkdir(secondDocs, { recursive: true });

    watcher = new FilesystemTaskDocumentWatcher(DOCS_DIRECTORY_NAME);
    const callback = vi.fn();
    watcher.onChange(callback);
    watcher.start(firstProject);
    watcher.retarget(secondProject);

    await writeFile(join(firstDocs, "old.md"), "---\nstatus: pending\n---\n");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(callback).not.toHaveBeenCalled();

    await writeFile(join(secondDocs, "new.md"), "---\nstatus: pending\n---\n");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(callback).toHaveBeenCalledTimes(1);

    await rm(firstProject, { recursive: true, force: true });
    await rm(secondProject, { recursive: true, force: true });
  });
});
