import { describe, expect, it } from "vitest";
import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { DoctorLayoutUseCase } from "../../../../../src/contexts/framework/application/doctor/doctor-layout-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstallationFile } from "../../../../../src/kernel/file.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { FakeAuthReader } from "../../../../helpers/ports/fake-auth-reader.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/project";
const CLAUDE_COMMAND = ".claude/commands/plan.md";
const SIGNAL = "---\nname: aidd:01:plan\ndescription: Plan\n---\n";
const hasher = new DeterministicHasher();

function manifestTrackingClaude(): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "1.0.0", [
    new InstallationFile({
      relativePath: CLAUDE_COMMAND,
      content: SIGNAL,
      hash: hasher.hash(SIGNAL),
    }),
  ]);
  return manifest;
}

async function issuesFor(onDisk: Record<string, string>, authReader?: FakeAuthReader) {
  const files = Object.fromEntries(
    Object.entries(onDisk).map(([relativePath, content]) => [
      `${PROJECT_ROOT}/${relativePath}`,
      content,
    ])
  );
  return new DoctorLayoutUseCase(new InMemoryFileAdapter(files, hasher), authReader).execute({
    manifest: manifestTrackingClaude(),
    projectRoot: PROJECT_ROOT,
  });
}

describe("DoctorLayoutUseCase", () => {
  describe("orphaned tool directories", () => {
    it("warns about a tool directory holding aidd files the manifest does not track", async () => {
      const issues = await issuesFor({
        [CLAUDE_COMMAND]: SIGNAL,
        ".cursor/commands/plan.md": SIGNAL,
      });

      expect(issues).toStrictEqual([
        {
          severity: "warning",
          message: "Orphaned directory: .cursor/ (not tracked in manifest)",
          fix: "Remove the directory manually, or run `aidd install <tool>` to track it.",
        },
      ]);
    });

    it("says nothing about a tracked tool directory holding aidd files", async () => {
      expect(await issuesFor({ [CLAUDE_COMMAND]: SIGNAL })).toStrictEqual([]);
    });
  });

  describe("authentication", () => {
    it("reports an info line when no token resolves", async () => {
      const issues = await issuesFor({}, new FakeAuthReader(null));

      expect(issues).toStrictEqual([
        { severity: "info", message: "Not authenticated", fix: "Run aidd auth login" },
      ]);
    });

    it("says nothing when a token resolves", async () => {
      expect(await issuesFor({}, new FakeAuthReader("token"))).toStrictEqual([]);
    });

    it("says nothing when nothing here can read a token", async () => {
      expect(await issuesFor({})).toStrictEqual([]);
    });
  });
});
