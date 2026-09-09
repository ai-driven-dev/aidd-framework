import { describe, expect, it } from "vitest";
import {
  parseTrackedFiles,
  type TrackedFile,
  toTrackedFileData,
  toTrackedFiles,
  withUpdatedHash,
} from "../../../../../src/contexts/framework/domain/manifest/tracked-files.js";
import { FileHash, InstallationFile } from "../../../../../src/kernel/file.js";

const HASH_A = new FileHash("a".repeat(32));
const HASH_B = new FileHash("b".repeat(32));
const HASH_NEW = new FileHash("f".repeat(32));

const installed = (relativePath: string, frameworkPath?: string): InstallationFile =>
  new InstallationFile({ relativePath, content: "content", hash: HASH_A, frameworkPath });

describe("tracked files — one tool's paths and hashes", () => {
  describe("recorded from an installation", () => {
    it("keeps where a framework-owned file came from", () => {
      expect(toTrackedFiles([installed(".claude/rules/a.md", "rules/a.md")])).toStrictEqual([
        { relativePath: ".claude/rules/a.md", hash: HASH_A, frameworkPath: "rules/a.md" },
      ]);
    });

    it("records no origin for a file that has none", () => {
      expect(toTrackedFiles([installed(".claude/CLAUDE.md")])).toStrictEqual([
        { relativePath: ".claude/CLAUDE.md", hash: HASH_A },
      ]);
    });
  });

  describe("serialized", () => {
    it("writes the origin beside the hash for a framework-owned file", () => {
      const file: TrackedFile = {
        relativePath: ".claude/rules/a.md",
        hash: HASH_A,
        frameworkPath: "rules/a.md",
      };

      expect(toTrackedFileData([file])).toStrictEqual([
        { relativePath: ".claude/rules/a.md", hash: "a".repeat(32), frameworkPath: "rules/a.md" },
      ]);
    });

    it("writes no origin key for a file that has none", () => {
      expect(
        toTrackedFileData([{ relativePath: ".claude/CLAUDE.md", hash: HASH_A }])
      ).toStrictEqual([{ relativePath: ".claude/CLAUDE.md", hash: "a".repeat(32) }]);
    });
  });

  describe("parsed", () => {
    it("reads the origin back for a framework-owned file", () => {
      expect(
        parseTrackedFiles([
          { relativePath: ".claude/rules/a.md", hash: "a".repeat(32), frameworkPath: "rules/a.md" },
        ])
      ).toStrictEqual([
        { relativePath: ".claude/rules/a.md", hash: HASH_A, frameworkPath: "rules/a.md" },
      ]);
    });

    it("reads no origin key for a file that has none", () => {
      expect(
        parseTrackedFiles([{ relativePath: ".claude/CLAUDE.md", hash: "a".repeat(32) }])
      ).toStrictEqual([{ relativePath: ".claude/CLAUDE.md", hash: HASH_A }]);
    });
  });

  describe("updating one file's hash", () => {
    const files: TrackedFile[] = [
      { relativePath: ".claude/a.md", hash: HASH_A },
      { relativePath: ".claude/b.md", hash: HASH_B },
    ];

    it("changes that file alone", () => {
      expect(withUpdatedHash(files, ".claude/b.md", HASH_NEW)).toStrictEqual([
        { relativePath: ".claude/a.md", hash: HASH_A },
        { relativePath: ".claude/b.md", hash: HASH_NEW },
      ]);
    });

    it("appends a bare entry for a path not yet tracked, touching no other", () => {
      expect(withUpdatedHash(files, ".claude/c.md", HASH_NEW)).toStrictEqual([
        { relativePath: ".claude/a.md", hash: HASH_A },
        { relativePath: ".claude/b.md", hash: HASH_B },
        { relativePath: ".claude/c.md", hash: HASH_NEW },
      ]);
    });
  });
});
