import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../../../src/runtime/auth/auth-storage.js";
import { makeAuthConfig } from "../../helpers/auth.js";

describe("AuthStorage", () => {
  let tempDir: string;
  let storage: AuthStorage;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "auth-storage-test-"));
    storage = new AuthStorage();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("read", () => {
    it("returns null when file does not exist", async () => {
      const result = await storage.read(join(tempDir, "nonexistent.json"));
      expect(result).toBeNull();
    });

    it("returns null when file contains invalid JSON", async () => {
      const path = join(tempDir, "bad.json");
      await writeFile(path, "not json");
      const result = await storage.read(path);
      expect(result).toBeNull();
    });

    it("returns null when file contains JSON missing required fields", async () => {
      const path = join(tempDir, "incomplete.json");
      await writeFile(path, JSON.stringify({ version: 1 }));
      const result = await storage.read(path);
      expect(result).toBeNull();
    });

    it("returns AuthConfig when file is valid", async () => {
      const config = makeAuthConfig({ token: "ghp_abc123" });
      const path = join(tempDir, "auth.json");
      await writeFile(path, JSON.stringify(config));
      const result = await storage.read(path);
      expect(result).toEqual(config);
    });
  });

  describe("write", () => {
    it("creates parent directories and writes the file", async () => {
      const path = join(tempDir, "nested", "dir", "auth.json");
      const config = makeAuthConfig({ method: "external", level: "project", token: undefined });
      await storage.write(path, config);
      const content = await readFile(path, "utf-8");
      expect(JSON.parse(content)).toEqual(config);
    });

    it("sets restrictive file permissions on non-Windows", async () => {
      if (process.platform === "win32") return;
      const path = join(tempDir, "auth.json");
      await storage.write(path, makeAuthConfig({ token: "ghp_secret" }));
      const stats = await stat(path);
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it("written file can be read back", async () => {
      const path = join(tempDir, "auth.json");
      const config = makeAuthConfig({ token: "ghp_roundtrip" });
      await storage.write(path, config);
      const result = await storage.read(path);
      expect(result).toEqual(config);
    });
  });

  describe("delete", () => {
    it("removes an existing file", async () => {
      const path = join(tempDir, "auth.json");
      await writeFile(path, "{}");
      await storage.delete(path);
      await expect(readFile(path)).rejects.toThrow();
    });

    it("does not throw when file does not exist", async () => {
      await expect(storage.delete(join(tempDir, "missing.json"))).resolves.not.toThrow();
    });
  });

  describe("paths", () => {
    it("projectConfigPath returns .aidd/auth.json under projectRoot", () => {
      const path = storage.projectConfigPath("/my/project");
      expect(path).toBe("/my/project/.aidd/auth.json");
    });

    it("userConfigPath respects AIDD_USER_CONFIG_DIR env override", () => {
      const original = process.env.AIDD_USER_CONFIG_DIR;
      try {
        process.env.AIDD_USER_CONFIG_DIR = "/custom/config/dir";
        const path = storage.userConfigPath();
        expect(path).toBe("/custom/config/dir/auth.json");
      } finally {
        if (original === undefined) {
          delete process.env.AIDD_USER_CONFIG_DIR;
        } else {
          process.env.AIDD_USER_CONFIG_DIR = original;
        }
      }
    });
  });

  describe("readActive", () => {
    it("returns AIDD_TOKEN env config when env var is set", async () => {
      const original = process.env.AIDD_TOKEN;
      try {
        process.env.AIDD_TOKEN = "env-token-123";
        const result = await storage.readActive(tempDir);
        expect(result).not.toBeNull();
        expect(result?.token).toBe("env-token-123");
        expect(result?.method).toBe("stored");
      } finally {
        if (original === undefined) {
          delete process.env.AIDD_TOKEN;
        } else {
          process.env.AIDD_TOKEN = original;
        }
      }
    });

    it("returns project config when no AIDD_TOKEN env var but project auth.json exists", async () => {
      const original = process.env.AIDD_TOKEN;
      delete process.env.AIDD_TOKEN;
      try {
        const config = makeAuthConfig({ token: "project-tok", level: "project" });
        const projectPath = storage.projectConfigPath(tempDir);
        await storage.write(projectPath, config);

        const result = await storage.readActive(tempDir);

        expect(result?.token).toBe("project-tok");
        expect(result?.level).toBe("project");
      } finally {
        if (original !== undefined) process.env.AIDD_TOKEN = original;
      }
    });

    it("returns user config when no AIDD_TOKEN and no project auth.json", async () => {
      const original = process.env.AIDD_TOKEN;
      const userConfigDirOriginal = process.env.AIDD_USER_CONFIG_DIR;
      delete process.env.AIDD_TOKEN;
      try {
        process.env.AIDD_USER_CONFIG_DIR = tempDir;
        const config = makeAuthConfig({ token: "user-tok", level: "user" });
        const userPath = storage.userConfigPath();
        await storage.write(userPath, config);

        const result = await storage.readActive("/some/other/project");

        expect(result?.token).toBe("user-tok");
      } finally {
        if (original !== undefined) process.env.AIDD_TOKEN = original;
        if (userConfigDirOriginal === undefined) {
          delete process.env.AIDD_USER_CONFIG_DIR;
        } else {
          process.env.AIDD_USER_CONFIG_DIR = userConfigDirOriginal;
        }
      }
    });

    it("returns null when no token source is available", async () => {
      const tokenOriginal = process.env.AIDD_TOKEN;
      const userConfigDirOriginal = process.env.AIDD_USER_CONFIG_DIR;
      delete process.env.AIDD_TOKEN;
      process.env.AIDD_USER_CONFIG_DIR = join(tempDir, "no-such-dir");
      try {
        const result = await storage.readActive(join(tempDir, "no-project"));
        expect(result).toBeNull();
      } finally {
        if (tokenOriginal !== undefined) process.env.AIDD_TOKEN = tokenOriginal;
        if (userConfigDirOriginal === undefined) {
          delete process.env.AIDD_USER_CONFIG_DIR;
        } else {
          process.env.AIDD_USER_CONFIG_DIR = userConfigDirOriginal;
        }
      }
    });
  });

  describe("save", () => {
    it("saves project-level credential to .aidd/auth.json", async () => {
      const credential = { method: "stored" as const, token: "ghp_save_project" };
      await storage.save({ credential, level: "project", projectRoot: tempDir });

      const saved = await storage.read(storage.projectConfigPath(tempDir));
      expect(saved?.token).toBe("ghp_save_project");
      expect(saved?.level).toBe("project");
    });

    it("saves user-level credential to user config path", async () => {
      const userConfigDirOriginal = process.env.AIDD_USER_CONFIG_DIR;
      process.env.AIDD_USER_CONFIG_DIR = tempDir;
      try {
        const credential = { method: "stored" as const, token: "ghp_save_user" };
        await storage.save({ credential, level: "user", projectRoot: tempDir });

        const saved = await storage.read(storage.userConfigPath());
        expect(saved?.token).toBe("ghp_save_user");
        expect(saved?.level).toBe("user");
      } finally {
        if (userConfigDirOriginal === undefined) {
          delete process.env.AIDD_USER_CONFIG_DIR;
        } else {
          process.env.AIDD_USER_CONFIG_DIR = userConfigDirOriginal;
        }
      }
    });

    it("saves external credential without token field", async () => {
      const credential = { method: "external" as const, provider: "gh" };
      await storage.save({ credential, level: "project", projectRoot: tempDir });

      const saved = await storage.read(storage.projectConfigPath(tempDir));
      expect(saved?.method).toBe("external");
      expect("token" in (saved ?? {})).toBe(false);
    });
  });
});
