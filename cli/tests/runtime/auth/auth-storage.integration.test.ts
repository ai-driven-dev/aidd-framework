import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFileSync: vi.fn() };
});

import { AuthStorage } from "../../../src/runtime/auth/auth-storage.js";
import { makeAuthConfig } from "../../helpers/auth.js";

/**
 * `process.platform` is a plain value property, so it is redefined rather than spied on.
 * The win32 branch is the only one that shells out, and no CI runner this suite runs on
 * is Windows, so it would otherwise never be exercised at all. `USERNAME` comes with it:
 * every Windows session has one and no POSIX one does.
 */
async function asWin32<T>(run: () => Promise<T>, account = "tester"): Promise<T> {
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  const username = process.env.USERNAME;
  Object.defineProperty(process, "platform", { value: "win32", configurable: true });
  process.env.USERNAME = account;
  try {
    return await run();
  } finally {
    if (platform !== undefined) Object.defineProperty(process, "platform", platform);
    if (username === undefined) delete process.env.USERNAME;
    else process.env.USERNAME = username;
  }
}

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

    it("restricts the file on win32 through an icacls argument list, never a shell command line", async () => {
      const path = join(tempDir, "auth.json");
      vi.mocked(execFileSync).mockClear();

      await asWin32(() => storage.write(path, makeAuthConfig({ token: "ghp_win" })));

      expect(execFileSync).toHaveBeenCalledTimes(1);
      const [command, args] = vi.mocked(execFileSync).mock.calls[0] ?? [];
      expect(command).toBe("icacls");
      expect(args).toEqual([path, "/inheritance:r", "/grant:r", expect.stringContaining(":(R,W)")]);
    });

    it("names the account from the environment, not the %USERNAME% only a shell would expand", async () => {
      vi.mocked(execFileSync).mockClear();

      await asWin32(
        () => storage.write(join(tempDir, "auth.json"), makeAuthConfig({ token: "ghp_win" })),
        "Ada Lovelace"
      );

      const args = vi.mocked(execFileSync).mock.calls[0]?.[1];
      expect(args).toContain("Ada Lovelace:(R,W)");
    });

    it("refuses to leave inheritance stripped with no grant when the session names no account", async () => {
      const platform = Object.getOwnPropertyDescriptor(process, "platform");
      const username = process.env.USERNAME;
      Object.defineProperty(process, "platform", { value: "win32", configurable: true });
      delete process.env.USERNAME;
      try {
        await expect(
          storage.write(join(tempDir, "auth.json"), makeAuthConfig({ token: "ghp_win" }))
        ).rejects.toThrow(/USERNAME/);
      } finally {
        if (platform !== undefined) Object.defineProperty(process, "platform", platform);
        if (username !== undefined) process.env.USERNAME = username;
      }
    });

    it("passes a path carrying shell metacharacters as one verbatim argument", async () => {
      // `"` is illegal in an NTFS filename — `storage.write` really writes this file to
      // disk before the (mocked) icacls call, so it must stay legal on every filesystem
      // this suite runs on. `&`, the space, `;` and `$` are all NTFS-legal and still prove
      // the point: `execFileSync` receives this as one array element, never concatenated
      // into a shell string a real shell would split on them.
      const path = join(tempDir, "a & echo pwned; $HOME & b.json");
      vi.mocked(execFileSync).mockClear();

      await asWin32(() => storage.write(path, makeAuthConfig({ token: "ghp_win" })));

      const args = vi.mocked(execFileSync).mock.calls[0]?.[1];
      expect(args?.[0]).toBe(path);
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
      expect(path).toBe(join("/my/project", ".aidd", "auth.json"));
    });

    it("userConfigPath respects AIDD_USER_CONFIG_DIR env override", () => {
      const original = process.env.AIDD_USER_CONFIG_DIR;
      try {
        process.env.AIDD_USER_CONFIG_DIR = "/custom/config/dir";
        const path = storage.userConfigPath();
        expect(path).toBe(join("/custom/config/dir", "auth.json"));
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
