import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

import { FileAdapter } from "../../../src/runtime/filesystem/file-adapter.js";
import { HasherAdapter } from "../../../src/runtime/filesystem/hasher-adapter.js";

describe("FileAdapter", () => {
  let tempDir: string;
  let fs: FileAdapter;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aidd-fs-adapter-"));
    fs = new FileAdapter(new HasherAdapter());
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("writeFile()", () => {
    it("writes file content", async () => {
      const path = join(tempDir, "test.txt");
      await fs.writeFile(path, "hello");
      const content = await readFile(path, "utf-8");
      expect(content).toBe("hello");
    });

    it("creates parent directories recursively", async () => {
      const path = join(tempDir, "a", "b", "c", "test.txt");
      await fs.writeFile(path, "nested");
      const content = await readFile(path, "utf-8");
      expect(content).toBe("nested");
    });

    // A crash mid-write must never leave a truncated file at `path`: two concurrent
    // `aidd setup` runs on the same machine both write `references.json`, by design.
    // `rename` is the one POSIX-atomic step that makes that safe — writing straight
    // to `path` is not. What is checkable in-process is that the mechanism is the
    // one actually used, not merely that the end state happens to look right.
    it("writes through a temporary file and renames it into place", async () => {
      const path = join(tempDir, "atomic.txt");
      await writeFile(path, "old content", "utf-8");
      vi.mocked(rename).mockClear();

      await fs.writeFile(path, "new content");

      expect(rename).toHaveBeenCalledTimes(1);
      const [renamedFrom, renamedTo] = vi.mocked(rename).mock.calls[0] as [string, string];
      expect(renamedTo).toBe(path);
      expect(renamedFrom).not.toBe(path);
      expect(await readFile(path, "utf-8")).toBe("new content");
    });
  });

  describe("readFile()", () => {
    it("reads and provides file content as string", async () => {
      const path = join(tempDir, "read.txt");
      await writeFile(path, "content to read", "utf-8");
      const result = await fs.readFile(path);
      expect(result).toBe("content to read");
    });
  });

  describe("deleteFile()", () => {
    it("removes an existing file", async () => {
      const path = join(tempDir, "to-delete.txt");
      await writeFile(path, "data", "utf-8");
      await fs.deleteFile(path);
      expect(await fs.fileExists(path)).toBe(false);
    });

    it("handles missing file gracefully", async () => {
      const path = join(tempDir, "nonexistent.txt");
      await expect(fs.deleteFile(path)).resolves.toBeUndefined();
    });
  });

  describe("createDirectory()", () => {
    it("creates directory recursively", async () => {
      const path = join(tempDir, "x", "y", "z");
      await fs.createDirectory(path);
      expect(await fs.fileExists(path)).toBe(true);
    });
  });

  describe("deleteEmptyDirectories()", () => {
    it("removes empty directory", async () => {
      const dir = join(tempDir, "empty");
      await mkdir(dir);
      await fs.deleteEmptyDirectories(dir);
      expect(await fs.fileExists(dir)).toBe(false);
    });

    it("removes chain of empty directories", async () => {
      const inner = join(tempDir, "outer", "inner");
      await mkdir(inner, { recursive: true });
      await fs.deleteEmptyDirectories(inner);
      expect(await fs.fileExists(join(tempDir, "outer"))).toBe(false);
    });

    it("stops when directory is not empty", async () => {
      const outer = join(tempDir, "outer2");
      const inner = join(outer, "inner");
      const sibling = join(outer, "sibling.txt");
      await mkdir(inner, { recursive: true });
      await writeFile(sibling, "content", "utf-8");

      await fs.deleteEmptyDirectories(inner);
      expect(await fs.fileExists(inner)).toBe(false);
      expect(await fs.fileExists(outer)).toBe(true);
    });
  });

  describe("listDirectory()", () => {
    it("lists all files recursively with relative paths", async () => {
      await fs.writeFile(join(tempDir, "a.txt"), "a");
      await fs.writeFile(join(tempDir, "sub", "b.txt"), "b");
      await fs.writeFile(join(tempDir, "sub", "deep", "c.txt"), "c");

      const files = await fs.listDirectory(tempDir);
      expect(files).toContain("a.txt");
      // FileAdapter.listDirectory() deliberately normalizes every relative path to "/"
      // (see its own `.split(sep).join("/")`) — this is what a manifest, read on every
      // platform, stores — so the expectation is the POSIX literal, never join().
      expect(files).toContain("sub/b.txt");
      expect(files).toContain("sub/deep/c.txt");
    });
  });

  describe("fileExists()", () => {
    it("confirms an existing file is found", async () => {
      const path = join(tempDir, "exists.txt");
      await writeFile(path, "", "utf-8");
      expect(await fs.fileExists(path)).toBe(true);
    });

    it("confirms a missing file is not found", async () => {
      expect(await fs.fileExists(join(tempDir, "missing.txt"))).toBe(false);
    });

    it("confirms an existing directory is found", async () => {
      expect(await fs.fileExists(tempDir)).toBe(true);
    });
  });

  describe("readFileHash()", () => {
    it("returns hash of file content", async () => {
      const path = join(tempDir, "hash-me.txt");
      await writeFile(path, "hashable content", "utf-8");
      const hash = await fs.readFileHash(path);
      expect(hash.value).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe("mergeJsonFile()", () => {
    it("creates file if it does not exist", async () => {
      const path = join(tempDir, "new.json");
      await fs.mergeJsonFile(path, JSON.stringify({ key: "value" }), "framework-prime");
      const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
      expect(result).toEqual({ key: "value" });
    });

    it("merges new keys into existing JSON", async () => {
      const path = join(tempDir, "merge.json");
      await writeFile(path, JSON.stringify({ existing: "data" }), "utf-8");
      await fs.mergeJsonFile(path, JSON.stringify({ newKey: "newValue" }), "framework-prime");
      const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
      expect(result.existing).toBe("data");
      expect(result.newKey).toBe("newValue");
    });

    describe("framework prime strategy", () => {
      it("incoming scalar values override existing values", async () => {
        const path = join(tempDir, "override-framework-prime.json");
        await writeFile(path, JSON.stringify({ key: "old" }), "utf-8");
        await fs.mergeJsonFile(path, JSON.stringify({ key: "new" }), "framework-prime");
        const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
        expect(result.key).toBe("new");
      });
    });

    describe("user prime strategy", () => {
      it("existing scalar values win over incoming values", async () => {
        const path = join(tempDir, "override-user-prime.json");
        await writeFile(path, JSON.stringify({ key: "user-value" }), "utf-8");
        await fs.mergeJsonFile(path, JSON.stringify({ key: "framework-value" }), "user-prime");
        const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
        expect(result.key).toBe("user-value");
      });

      it("new framework keys are added when absent in the existing file", async () => {
        const path = join(tempDir, "new-keys-user-prime.json");
        await writeFile(path, JSON.stringify({ existing: "data" }), "utf-8");
        await fs.mergeJsonFile(path, JSON.stringify({ newKey: "newValue" }), "user-prime");
        const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
        expect(result.existing).toBe("data");
        expect(result.newKey).toBe("newValue");
      });
    });

    it("deep merges nested objects", async () => {
      const path = join(tempDir, "deep.json");
      await writeFile(path, JSON.stringify({ outer: { a: 1, b: 2 } }), "utf-8");
      await fs.mergeJsonFile(path, JSON.stringify({ outer: { b: 99, c: 3 } }), "framework-prime");
      const result = JSON.parse(await readFile(path, "utf-8")) as {
        outer: Record<string, number>;
      };
      expect(result.outer.a).toBe(1);
      expect(result.outer.b).toBe(99);
      expect(result.outer.c).toBe(3);
    });

    it("deduplicates merged arrays", async () => {
      const path = join(tempDir, "arrays.json");
      await writeFile(path, JSON.stringify({ items: ["a", "b"] }), "utf-8");
      await fs.mergeJsonFile(path, JSON.stringify({ items: ["b", "c"] }), "framework-prime");
      const result = JSON.parse(await readFile(path, "utf-8")) as { items: string[] };
      expect(result.items).toContain("a");
      expect(result.items).toContain("b");
      expect(result.items).toContain("c");
      expect(result.items.filter((x) => x === "b")).toHaveLength(1);
    });

    it("deduplicates merged arrays of objects by value", async () => {
      const path = join(tempDir, "obj-arrays.json");
      const entry = { file: "aidd_docs/templates/vcs/pull_request.md" };
      await writeFile(path, JSON.stringify({ instructions: [entry] }), "utf-8");
      await fs.mergeJsonFile(path, JSON.stringify({ instructions: [entry] }), "framework-prime");
      const result = JSON.parse(await readFile(path, "utf-8")) as {
        instructions: (typeof entry)[];
      };
      expect(result.instructions).toHaveLength(1);
      expect(result.instructions[0]).toEqual(entry);
    });

    it("strips JSONC comments before merging", async () => {
      const path = join(tempDir, "jsonc.json");
      const jsonc = `{
  // single-line comment
  "key": "value",
  /* block comment */
  "other": true
}`;
      await fs.mergeJsonFile(path, jsonc, "framework-prime");
      const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
      expect(result.key).toBe("value");
      expect(result.other).toBe(true);
    });

    it("strips trailing commas in incoming content before merging", async () => {
      const path = join(tempDir, "trailing-incoming.json");
      const jsonc = `{
  "key": "value",
  "nested": {
    "a": 1,
  },
}`;
      await fs.mergeJsonFile(path, jsonc, "framework-prime");
      const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
      expect(result.key).toBe("value");
      expect((result.nested as Record<string, number>).a).toBe(1);
    });

    it("tolerates JSONC trailing commas in an existing file", async () => {
      const path = join(tempDir, "existing-jsonc.json");
      const existingWithTrailingComma = `{
  "keep": "me",
  "nested": {
    "a": 1,
  }
}`;
      await writeFile(path, existingWithTrailingComma, "utf-8");
      await fs.mergeJsonFile(path, JSON.stringify({ added: true }), "framework-prime");
      const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
      expect(result.keep).toBe("me");
      expect(result.added).toBe(true);
    });

    describe("per-key strategy", () => {
      describe("framework-prime key", () => {
        it("incoming value wins over existing value", async () => {
          const path = join(tempDir, "per-key-fp.json");
          await writeFile(path, JSON.stringify({ "github.copilot.enable": false }), "utf-8");
          await fs.mergeJsonFile(path, JSON.stringify({ "github.copilot.enable": true }), {
            default: "user-prime",
            frameworkOverrideKeys: ["github.copilot.enable"],
          });
          const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
          expect(result["github.copilot.enable"]).toBe(true);
        });
      });

      describe("user-prime key", () => {
        it("existing value wins over incoming value", async () => {
          const path = join(tempDir, "per-key-up.json");
          await writeFile(path, JSON.stringify({ "editor.fontSize": 14 }), "utf-8");
          await fs.mergeJsonFile(path, JSON.stringify({ "editor.fontSize": 16 }), {
            default: "user-prime",
            frameworkOverrideKeys: ["github.copilot.enable"],
          });
          const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
          expect(result["editor.fontSize"]).toBe(14);
        });

        it("incoming value is added when key is absent from disk", async () => {
          const path = join(tempDir, "per-key-new.json");
          await writeFile(path, JSON.stringify({}), "utf-8");
          await fs.mergeJsonFile(path, JSON.stringify({ "chat.agent.enabled": true }), {
            default: "user-prime",
            frameworkOverrideKeys: ["chat.agent.enabled"],
          });
          const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
          expect(result["chat.agent.enabled"]).toBe(true);
        });
      });
    });

    it("tolerates comments and trailing commas in an existing .jsonc file", async () => {
      const path = join(tempDir, "opencode.jsonc");
      const existingJsonc = `{
  // provider config
  "model": "neogen/swe-dev",
  "provider": {
    "neogen": {
      "npm": "@ai-sdk/openai-compatible",
      /* base URL */
      "options": {
        "baseURL": "https://neogen.example.com/api",
      },
    },
  },
}`;
      await writeFile(path, existingJsonc, "utf-8");
      await fs.mergeJsonFile(path, JSON.stringify({ share: "disabled" }), "framework-prime");
      const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
      expect(result.model).toBe("neogen/swe-dev");
      expect(result.share).toBe("disabled");
      expect((result.provider as Record<string, unknown>).neogen).toBeDefined();
    });

    describe("prototype pollution guard", () => {
      it("does not pollute Object.prototype after merging __proto__ payload", async () => {
        const path = join(tempDir, "proto-test.json");
        // Must pass a raw JSON string — a JS literal { __proto__: ... } would set the prototype,
        // not create an own key, and test nothing.
        const malicious = '{"__proto__":{"polluted":true}}';
        await fs.mergeJsonFile(path, malicious, "framework-prime");
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      });

      it("does not pollute Object.prototype after merging constructor payload", async () => {
        const path = join(tempDir, "constructor-test.json");
        const malicious = '{"constructor":{"prototype":{"polluted":true}}}';
        await fs.mergeJsonFile(path, malicious, "framework-prime");
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      });

      it("merges regular keys correctly when prototype keys are present", async () => {
        const path = join(tempDir, "mixed-test.json");
        await writeFile(path, JSON.stringify({ safe: "original" }), "utf-8");
        const malicious = '{"safe":"updated","__proto__":{"polluted":true}}';
        await fs.mergeJsonFile(path, malicious, "framework-prime");
        const result = JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
        expect(result.safe).toBe("updated");
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      });
    });
  });

  describe("listDirectory() — symlink security", () => {
    it("skips symbolic links and does not read their content", async () => {
      const real = join(tempDir, "real-file.txt");
      const outside = join(tempDir, "secret.txt");
      const skillsDir = join(tempDir, "skills");
      const linkPath = join(skillsDir, "secret-link.txt");
      const normalFile = join(skillsDir, "normal.md");

      await writeFile(real, "real content", "utf-8");
      await writeFile(outside, "secret content", "utf-8");
      await mkdir(skillsDir, { recursive: true });
      await symlink(outside, linkPath);
      await writeFile(normalFile, "normal content", "utf-8");

      const files = await fs.listDirectory(tempDir);

      // symlink must NOT appear
      const posixFiles = files.map((f) => f.split("\\").join("/"));
      expect(posixFiles).not.toContain("skills/secret-link.txt");

      // regular file inside skills/ must still appear
      expect(posixFiles.some((f) => f.includes("normal"))).toBe(true);
    });
  });
});
