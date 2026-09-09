import { describe, expect, it } from "vitest";
import { DoctorReferencesUseCase } from "../../../../../src/contexts/framework/application/doctor/doctor-references-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import type { ToolId } from "../../../../../src/kernel/tool.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/project";
const DOC = ".claude/rules/doc.md";
const PLUGIN_DOC = ".claude/plugins/sample/agents/reviewer.md";
const hasher = new DeterministicHasher();

function brokenIn(relativePath: string, ref: string) {
  return {
    severity: "warning",
    message: `Broken reference in ${relativePath}: "${ref}" not found on disk`,
    fix: `Restore the missing file or remove the reference in ${relativePath}`,
  };
}

function manifestWithPluginDoc(content: string): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "1.0.0", []);
  manifest.addPlugin(
    "claude",
    InstalledPlugin.fromJSON({
      name: "sample",
      source: { kind: "local", path: "/some/path" },
      version: "1.0.0",
      strict: false,
      files: { [PLUGIN_DOC]: hasher.hash(content).value },
      scope: "project",
    })
  );
  return manifest;
}

async function issuesFor(
  onDisk: Record<string, string>,
  options: {
    trackedFiles?: { relativePath: string; toolId: ToolId | null }[];
    manifest?: Manifest;
    allowedIds?: Set<string> | null;
  } = {}
) {
  const files = Object.fromEntries(
    Object.entries(onDisk).map(([relativePath, content]) => [
      `${PROJECT_ROOT}/${relativePath}`,
      content,
    ])
  );
  return new DoctorReferencesUseCase(new InMemoryFileAdapter(files, hasher)).execute({
    manifest: options.manifest ?? Manifest.create(),
    projectRoot: PROJECT_ROOT,
    allowedIds: options.allowedIds ?? null,
    trackedFiles: options.trackedFiles ?? [],
  });
}

const TRACKED_DOC = [{ relativePath: DOC, toolId: "claude" as const }];

describe("DoctorReferencesUseCase", () => {
  describe("references in a tracked markdown file", () => {
    it("reports a warning for an @ reference to a file that is not on disk", async () => {
      const issues = await issuesFor(
        { [DOC]: "See @docs/missing.md" },
        { trackedFiles: TRACKED_DOC }
      );

      expect(issues).toStrictEqual([brokenIn(DOC, "docs/missing.md")]);
    });

    it("reports a warning for a markdown link resolved from the file's own directory", async () => {
      const issues = await issuesFor(
        { [DOC]: "[sibling](gone.md)" },
        { trackedFiles: TRACKED_DOC }
      );

      expect(issues).toStrictEqual([brokenIn(DOC, "gone.md")]);
    });

    it("reports nothing when every reference resolves", async () => {
      const issues = await issuesFor(
        {
          [DOC]: "See @docs/here.md and [sibling](other.md)",
          "docs/here.md": "",
          ".claude/rules/other.md": "",
        },
        { trackedFiles: TRACKED_DOC }
      );

      expect(issues).toStrictEqual([]);
    });

    it("never looks up a directory reference", async () => {
      const issues = await issuesFor(
        { [DOC]: "See @docs/nowhere/ and [dir](elsewhere/)" },
        { trackedFiles: TRACKED_DOC }
      );

      expect(issues).toStrictEqual([]);
    });

    it("ignores a link that resolves outside the project", async () => {
      const issues = await issuesFor(
        { [DOC]: "[up](../../../outside.md)" },
        { trackedFiles: TRACKED_DOC }
      );

      expect(issues).toStrictEqual([]);
    });

    it("reports nothing for a tracked file that is not on disk", async () => {
      expect(await issuesFor({}, { trackedFiles: TRACKED_DOC })).toStrictEqual([]);
    });
  });

  describe("which files are scanned", () => {
    it("scans only markdown files", async () => {
      const settings = ".claude/settings.json";
      const issues = await issuesFor(
        { [settings]: "@docs/missing.md" },
        { trackedFiles: [{ relativePath: settings, toolId: "claude" }] }
      );

      expect(issues).toStrictEqual([]);
    });

    it("skips a file whose markdown extension is not its last one", async () => {
      const backup = ".claude/rules/doc.md.bak";
      const issues = await issuesFor(
        { [backup]: "@docs/missing.md" },
        { trackedFiles: [{ relativePath: backup, toolId: "claude" }] }
      );

      expect(issues).toStrictEqual([]);
    });

    it("skips a file under a tasks directory", async () => {
      const task = "aidd_docs/tasks/plan.md";
      const issues = await issuesFor(
        { [task]: "@docs/missing.md" },
        { trackedFiles: [{ relativePath: task, toolId: null }] }
      );

      expect(issues).toStrictEqual([]);
    });
  });

  describe("files of an installed plugin", () => {
    const content = "See @docs/missing.md";

    it("are scanned like tracked files", async () => {
      const issues = await issuesFor(
        { [PLUGIN_DOC]: content },
        { manifest: manifestWithPluginDoc(content) }
      );

      expect(issues).toStrictEqual([brokenIn(PLUGIN_DOC, "docs/missing.md")]);
    });

    it("are ignored when their tool is outside the narrowed set", async () => {
      const issues = await issuesFor(
        { [PLUGIN_DOC]: content },
        { manifest: manifestWithPluginDoc(content), allowedIds: new Set(["cursor"]) }
      );

      expect(issues).toStrictEqual([]);
    });

    it("are still scanned when their tool is inside the narrowed set", async () => {
      const issues = await issuesFor(
        { [PLUGIN_DOC]: content },
        { manifest: manifestWithPluginDoc(content), allowedIds: new Set(["claude"]) }
      );

      expect(issues).toStrictEqual([brokenIn(PLUGIN_DOC, "docs/missing.md")]);
    });
  });
});
