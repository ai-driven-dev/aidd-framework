import { describe, expect, it } from "vitest";
import { GitignoreUseCase } from "../../../../src/contexts/framework/application/gitignore-use-case.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";

const ROOT = "/project";
const GITIGNORE = "/project/.gitignore";

function build(existing?: string) {
  const fs = new InMemoryFileAdapter(existing === undefined ? {} : { [GITIGNORE]: existing });
  return { fs, useCase: new GitignoreUseCase(fs) };
}

describe("GitignoreUseCase", () => {
  describe("execute", () => {
    it("creates the file from the entries, one per line, ending with a newline", async () => {
      const { fs, useCase } = build();

      await expect(useCase.execute(ROOT, ["a/", "b/"])).resolves.toBe(true);

      expect(fs.getFile(GITIGNORE)).toBe("a/\nb/\n");
    });

    it("starts a new line before appending to a file without a trailing newline", async () => {
      const { fs, useCase } = build("keep");

      await useCase.execute(ROOT, ["a/"]);

      expect(fs.getFile(GITIGNORE)).toBe("keep\na/\n");
    });

    it("appends right after a trailing newline, without a blank line", async () => {
      const { fs, useCase } = build("keep\n");

      await useCase.execute(ROOT, ["a/"]);

      expect(fs.getFile(GITIGNORE)).toBe("keep\na/\n");
    });

    it("answers false and leaves the file alone when every entry is already there", async () => {
      const { fs, useCase } = build("a/\n");

      await expect(useCase.execute(ROOT, ["a/"])).resolves.toBe(false);

      expect(fs.getFile(GITIGNORE)).toBe("a/\n");
    });

    it("counts an entry written with surrounding whitespace as present", async () => {
      const { fs, useCase } = build("  a/  \n");

      await expect(useCase.execute(ROOT, ["a/"])).resolves.toBe(false);

      expect(fs.getFile(GITIGNORE)).toBe("  a/  \n");
    });

    it("appends only the entries that are missing", async () => {
      const { fs, useCase } = build("a/\nb/\n");

      await expect(useCase.execute(ROOT, ["b/", "c/"])).resolves.toBe(true);

      expect(fs.getFile(GITIGNORE)).toBe("a/\nb/\nc/\n");
    });
  });

  describe("remove", () => {
    it("does nothing when there is no file", async () => {
      const { fs, useCase } = build();

      await expect(useCase.remove(ROOT, ["a/"])).resolves.toBeUndefined();

      expect(fs.has(GITIGNORE)).toBe(false);
    });

    it("drops the entry and keeps the other lines in order", async () => {
      const { fs, useCase } = build("a/\nb/\nc/\n");

      await useCase.remove(ROOT, ["b/"]);

      expect(fs.getFile(GITIGNORE)).toBe("a/\nc/\n");
    });

    it("drops an entry written with surrounding whitespace", async () => {
      const { fs, useCase } = build("  b/  \nc/\n");

      await useCase.remove(ROOT, ["b/"]);

      expect(fs.getFile(GITIGNORE)).toBe("c/\n");
    });

    it("leaves the file byte-identical when no entry matches", async () => {
      const { fs, useCase } = build("\na/\n\n");

      await useCase.remove(ROOT, ["z/"]);

      expect(fs.getFile(GITIGNORE)).toBe("\na/\n\n");
    });

    it("leaves an empty file in place when no entry matches", async () => {
      const { fs, useCase } = build("");

      await useCase.remove(ROOT, ["z/"]);

      expect(fs.getFile(GITIGNORE)).toBe("");
    });

    it("collapses the blank lines around what remains", async () => {
      const { fs, useCase } = build("\n\nb/\na/\nc/\n\n");

      await useCase.remove(ROOT, ["b/"]);

      expect(fs.getFile(GITIGNORE)).toBe("a/\nc/\n");
    });

    it("deletes the file once its last entry is removed", async () => {
      const { fs, useCase } = build("a/\n");

      await useCase.remove(ROOT, ["a/"]);

      expect(fs.has(GITIGNORE)).toBe(false);
    });
  });
});
