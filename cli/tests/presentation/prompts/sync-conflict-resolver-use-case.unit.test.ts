import { describe, expect, it } from "vitest";
import { SyncConflictResolverUseCase } from "../../../src/presentation/prompts/sync-conflict-resolver-use-case.js";
import { DeterministicHasher } from "../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../helpers/ports/in-memory-file-adapter.js";

const DISK_PATH = "/project/target.md";
const CONTENT_A = "content A";
const CONTENT_B = "content B";

function buildDeps() {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter({}, hasher);
  const resolver = new SyncConflictResolverUseCase(fs);
  return { hasher, fs, resolver };
}

describe("SyncConflictResolverUseCase", () => {
  describe("resolveWriteOutcome", () => {
    it("returns skipped when target content is identical to transformed content", async () => {
      const { fs, resolver } = buildDeps();
      await fs.writeFile(DISK_PATH, CONTENT_A);
      const targetManifestMap = new Map([["target.md", { value: "any-hash" }]]);

      const result = await resolver.resolveWriteOutcome({
        diskTargetPath: DISK_PATH,
        diskTargetExists: true,
        targetRelativePath: "target.md",
        targetManifestMap,
        targetContent: CONTENT_A,
        force: false,
      });

      expect(result).toEqual({ outcome: "skipped", conflict: false });
    });

    it("returns conflict when target differs from manifest hash and force is false", async () => {
      const { hasher, fs, resolver } = buildDeps();
      await fs.writeFile(DISK_PATH, CONTENT_B);
      const manifestHash = hasher.hash(CONTENT_A).value;
      const targetManifestMap = new Map([["target.md", { value: manifestHash }]]);

      const result = await resolver.resolveWriteOutcome({
        diskTargetPath: DISK_PATH,
        diskTargetExists: true,
        targetRelativePath: "target.md",
        targetManifestMap,
        targetContent: CONTENT_A,
        force: false,
      });

      expect(result).toEqual({ outcome: "conflict", conflict: true });
    });

    it("returns write with conflict=true when force overrides a detected conflict", async () => {
      const { hasher, fs, resolver } = buildDeps();
      await fs.writeFile(DISK_PATH, CONTENT_B);
      const manifestHash = hasher.hash(CONTENT_A).value;
      const targetManifestMap = new Map([["target.md", { value: manifestHash }]]);

      const result = await resolver.resolveWriteOutcome({
        diskTargetPath: DISK_PATH,
        diskTargetExists: true,
        targetRelativePath: "target.md",
        targetManifestMap,
        targetContent: CONTENT_A,
        force: true,
      });

      expect(result).toEqual({ outcome: "write", conflict: true });
    });

    it("returns write with conflict=false when target does not exist yet", async () => {
      const { resolver } = buildDeps();
      const targetManifestMap = new Map<string, { value: string }>();

      const result = await resolver.resolveWriteOutcome({
        diskTargetPath: DISK_PATH,
        diskTargetExists: false,
        targetRelativePath: "target.md",
        targetManifestMap,
        targetContent: CONTENT_A,
        force: false,
      });

      expect(result).toEqual({ outcome: "write", conflict: false });
    });
  });

  describe("resolvePluginWriteOutcome", () => {
    it("returns skipped when disk content matches target content", async () => {
      const { fs, resolver } = buildDeps();
      await fs.writeFile(DISK_PATH, CONTENT_A);

      const outcome = await resolver.resolvePluginWriteOutcome({
        diskTargetPath: DISK_PATH,
        targetContent: CONTENT_A,
        force: false,
      });

      expect(outcome).toBe("skipped");
    });

    it("returns conflict when file exists with different content and force is false", async () => {
      const { fs, resolver } = buildDeps();
      await fs.writeFile(DISK_PATH, CONTENT_A);

      const outcome = await resolver.resolvePluginWriteOutcome({
        diskTargetPath: DISK_PATH,
        targetContent: CONTENT_B,
        force: false,
      });

      expect(outcome).toBe("conflict");
    });

    it("returns write when force is true even if file exists", async () => {
      const { fs, resolver } = buildDeps();
      await fs.writeFile(DISK_PATH, CONTENT_A);

      const outcome = await resolver.resolvePluginWriteOutcome({
        diskTargetPath: DISK_PATH,
        targetContent: CONTENT_B,
        force: true,
      });

      expect(outcome).toBe("write");
    });

    it("returns write when file does not exist", async () => {
      const { resolver } = buildDeps();

      const outcome = await resolver.resolvePluginWriteOutcome({
        diskTargetPath: DISK_PATH,
        targetContent: CONTENT_A,
        force: false,
      });

      expect(outcome).toBe("write");
    });
  });
});
