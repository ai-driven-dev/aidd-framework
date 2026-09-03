import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "ink-testing-library";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusColumnsView } from "../../src/presentation/components/status-columns-view.js";
import { DOCS_DIRECTORY_NAME } from "../helpers/docs-directory.js";

const FIXTURES_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/frontmatter");

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

async function waitForFrame(
  lastFrame: () => string | undefined,
  expectedText: string
): Promise<string> {
  await vi.waitFor(() => {
    expect(lastFrame()).toContain(expectedText);
  });

  const frame = lastFrame();
  return frame === undefined ? "" : frame;
}

describe("StatusColumnsView", () => {
  let projectPath: string;
  let aiddDocsPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "aidd-kanban-interactive-"));
    aiddDocsPath = join(projectPath, DOCS_DIRECTORY_NAME);
    await mkdir(aiddDocsPath, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it("shows one column per distinct parent status, sub-documents nested beneath their parent", async () => {
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "plan.md", [
      "name: FID-560",
      "type: plan",
      "status: pending",
    ]);
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "phase-1.md", [
      "name: Phase 1",
      "status: blocked",
    ]);
    await writeTaskDocument(join(aiddDocsPath, "task-b"), "spec.md", [
      "name: SPEC-001",
      "type: spec",
      "status: completed",
    ]);

    const { lastFrame, unmount } = render(
      createElement(StatusColumnsView, {
        projectPath,
        docsDirectoryName: DOCS_DIRECTORY_NAME,
        terminalWidth: 100,
      })
    );

    const frame = await waitForFrame(lastFrame, "SPEC-001");
    expect(frame).toContain("PENDING");
    expect(frame).toContain("COMPLETED");
    expect(frame).toContain("FID-560");
    expect(frame).toContain("- Phase 1: blocked");

    unmount();
  });

  it("keeps status header and parent name legible when narrowing the simulated terminal width", async () => {
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "plan.md", [
      "name: FID-560",
      "type: plan",
      "status: pending",
    ]);
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "phase-1.md", [
      "name: Phase 1",
      "status: blocked",
    ]);

    const { lastFrame, unmount } = render(
      createElement(StatusColumnsView, {
        projectPath,
        docsDirectoryName: DOCS_DIRECTORY_NAME,
        terminalWidth: 20,
      })
    );

    const frame = await waitForFrame(lastFrame, "FID-560");
    expect(frame).toContain("PENDING");
    expect(frame).toContain("FID-560");
    expect(frame).not.toContain("- Phase 1: blocked");

    unmount();
  });

  it("hides a document missing its status field by default, but shows it when shouldIncludeUnknownStatus is true", async () => {
    await writeTaskDocument(join(aiddDocsPath, "task-a"), "spec.md", [
      "name: SPEC-001",
      "type: spec",
    ]);
    await writeTaskDocument(join(aiddDocsPath, "task-b"), "plan.md", [
      "name: FID-560",
      "type: plan",
      "status: pending",
    ]);

    const { lastFrame, unmount } = render(
      createElement(StatusColumnsView, {
        projectPath,
        docsDirectoryName: DOCS_DIRECTORY_NAME,
        terminalWidth: 100,
      })
    );

    const frame = await waitForFrame(lastFrame, "FID-560");
    expect(frame).not.toContain("SPEC-001");
    unmount();

    const { lastFrame: lastFrameWithAll, unmount: unmountWithAll } = render(
      createElement(StatusColumnsView, {
        projectPath,
        docsDirectoryName: DOCS_DIRECTORY_NAME,
        terminalWidth: 100,
        filters: { shouldIncludeUnknownStatus: true },
      })
    );

    const frameWithAll = await waitForFrame(lastFrameWithAll, "SPEC-001");
    expect(frameWithAll).toContain("SPEC-001");
    unmountWithAll();
  });

  it("end-to-end: a fixture document's name/type/status reach the rendered output unaltered", async () => {
    const fixtureContent = await readFile(join(FIXTURES_DIRECTORY, "valid-full.md"), "utf-8");
    await mkdir(join(aiddDocsPath, "task-fixture"), { recursive: true });
    await writeFile(join(aiddDocsPath, "task-fixture", "plan.md"), fixtureContent);

    const { lastFrame, unmount } = render(
      createElement(StatusColumnsView, {
        projectPath,
        docsDirectoryName: DOCS_DIRECTORY_NAME,
        terminalWidth: 100,
      })
    );

    const frame = await waitForFrame(lastFrame, "Test name");
    expect(frame).toContain("Test name");
    expect(frame).toContain("COMPLETED");

    unmount();
  });
});
