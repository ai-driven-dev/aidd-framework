import { describe, expect, it } from "vitest";
import type { AuthConfig } from "../../../src/runtime/auth/auth.js";
import { AuthReaderAdapter } from "../../../src/runtime/auth/auth-reader-adapter.js";
import type { AuthStorage } from "../../../src/runtime/auth/auth-storage.js";
import type { TokenResolver } from "../../../src/runtime/auth/ports/oauth-provider.js";

function makeStorage(
  overrides: Partial<{
    projectConfig: AuthConfig | null;
    userConfig: AuthConfig | null;
  }> = {}
): AuthStorage {
  const projectConfig = overrides.projectConfig ?? null;
  const userConfig = overrides.userConfig ?? null;
  return {
    userConfigPath: () => "/home/user/.config/aidd/auth.json",
    projectConfigPath: (_root: string) => "/project/.aidd/auth.json",
    read: async (path: string) => {
      if (path === "/project/.aidd/auth.json") return projectConfig;
      if (path === "/home/user/.config/aidd/auth.json") return userConfig;
      return null;
    },
    write: async () => {},
    delete: async () => {},
    save: async () => {},
    readActive: async () => null,
  } as AuthStorage;
}

function makeExternalProvider(token: string | null): TokenResolver {
  return { resolve: () => token };
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const original: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    original[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe("AuthReaderAdapter", () => {
  describe("AIDD_TOKEN env var (path 1)", () => {
    it("returns env token immediately", async () => {
      const storage = makeStorage();
      const reader = new AuthReaderAdapter(storage, "/project");
      const result = await withEnv({ AIDD_TOKEN: "env-token" }, () => reader.resolve());
      expect(result).toBe("env-token");
    });
  });

  describe("project auth.json (path 2)", () => {
    it("returns stored token when method=stored", async () => {
      const config: AuthConfig = {
        version: 1,
        method: "stored",
        level: "project",
        token: "project-token",
        createdAt: "2026-03-20T00:00:00.000Z",
      };
      const storage = makeStorage({ projectConfig: config });
      const reader = new AuthReaderAdapter(storage, "/project");
      const result = await withEnv({ AIDD_TOKEN: undefined }, () => reader.resolve());
      expect(result).toBe("project-token");
    });

    it("returns external token when method=external", async () => {
      const config: AuthConfig = {
        version: 1,
        method: "external",
        level: "project",
        createdAt: "2026-03-20T00:00:00.000Z",
      };
      const storage = makeStorage({ projectConfig: config });
      const reader = new AuthReaderAdapter(
        storage,
        "/project",
        undefined,
        makeExternalProvider("gh-project-token")
      );
      const result = await withEnv({ AIDD_TOKEN: undefined }, () => reader.resolve());
      expect(result).toBe("gh-project-token");
    });
  });

  describe("user auth.json (path 3)", () => {
    it("returns stored token when method=stored and no project config", async () => {
      const config: AuthConfig = {
        version: 1,
        method: "stored",
        level: "user",
        token: "user-token",
        createdAt: "2026-03-20T00:00:00.000Z",
      };
      const storage = makeStorage({ userConfig: config });
      const reader = new AuthReaderAdapter(storage, "/project");
      const result = await withEnv({ AIDD_TOKEN: undefined }, () => reader.resolve());
      expect(result).toBe("user-token");
    });

    it("returns external token when method=external", async () => {
      const config: AuthConfig = {
        version: 1,
        method: "external",
        level: "user",
        createdAt: "2026-03-20T00:00:00.000Z",
      };
      const storage = makeStorage({ userConfig: config });
      const reader = new AuthReaderAdapter(
        storage,
        "/project",
        undefined,
        makeExternalProvider("gh-user-token")
      );
      const result = await withEnv({ AIDD_TOKEN: undefined }, () => reader.resolve());
      expect(result).toBe("gh-user-token");
    });
  });

  describe("null fallback (path 4)", () => {
    it("returns null when no token source is available", async () => {
      const storage = makeStorage();
      const reader = new AuthReaderAdapter(
        storage,
        "/project",
        undefined,
        makeExternalProvider(null)
      );
      const result = await withEnv({ AIDD_TOKEN: undefined }, () => reader.resolve());
      expect(result).toBeNull();
    });
  });

  describe("resolveContext", () => {
    it("returns null when no token is available", async () => {
      const storage = makeStorage();
      const reader = new AuthReaderAdapter(
        storage,
        "/project",
        undefined,
        makeExternalProvider(null)
      );
      const result = await withEnv({ AIDD_TOKEN: undefined }, () =>
        reader.resolveContext("/project")
      );
      expect(result).toBeNull();
    });

    it("returns defaults method=stored and level=user when no config exists", async () => {
      const storage = makeStorage();
      const reader = new AuthReaderAdapter(storage, "/project");
      const result = await withEnv({ AIDD_TOKEN: "env-token" }, () =>
        reader.resolveContext("/project")
      );
      expect(result).toEqual({ token: "env-token", method: "stored", level: "user" });
    });

    it("reads method and level from project config", async () => {
      const config: AuthConfig = {
        version: 1,
        method: "external",
        level: "project",
        createdAt: "2026-03-20T00:00:00.000Z",
      };
      const storage = makeStorage({ projectConfig: config });
      const reader = new AuthReaderAdapter(
        storage,
        "/project",
        undefined,
        makeExternalProvider("gh-token")
      );
      const result = await withEnv({ AIDD_TOKEN: undefined }, () =>
        reader.resolveContext("/project")
      );
      expect(result).toEqual({ token: "gh-token", method: "external", level: "project" });
    });

    it("falls back to user config when no project config", async () => {
      const config: AuthConfig = {
        version: 1,
        method: "stored",
        level: "user",
        token: "user-token",
        createdAt: "2026-03-20T00:00:00.000Z",
      };
      const storage = makeStorage({ userConfig: config });
      const reader = new AuthReaderAdapter(storage, "/project");
      const result = await withEnv({ AIDD_TOKEN: undefined }, () =>
        reader.resolveContext("/project")
      );
      expect(result).toEqual({ token: "user-token", method: "stored", level: "user" });
    });
  });

  describe("memoization", () => {
    it("calls storage read only once across multiple resolve() calls", async () => {
      let readCount = 0;
      const storage: AuthStorage = {
        userConfigPath: () => "/home/user/.config/aidd/auth.json",
        projectConfigPath: (_root: string) => "/project/.aidd/auth.json",
        read: async () => {
          readCount++;
          return null;
        },
        write: async () => {},
        delete: async () => {},
        save: async () => {},
        readActive: async () => null,
      } as AuthStorage;
      const reader = new AuthReaderAdapter(storage, "/project");
      await withEnv({ AIDD_TOKEN: undefined }, async () => {
        await reader.resolve();
        await reader.resolve();
        await reader.resolve();
      });
      expect(readCount).toBe(2); // projectConfig + userConfig, each read once total
    });
  });

  describe("logging", () => {
    it("logs resolution source without revealing token value", async () => {
      const logged: string[] = [];
      const logger = {
        debug: (msg: string) => logged.push(msg),
        info: (_msg: string) => {},
        warn: (_msg: string) => {},
      };
      const storage = makeStorage();
      const reader = new AuthReaderAdapter(storage, "/project", logger);
      await withEnv({ AIDD_TOKEN: "my-secret" }, () => reader.resolve());
      expect(logged.some((m) => m.includes("AIDD_TOKEN"))).toBe(true);
      expect(logged.every((m) => !m.includes("my-secret"))).toBe(true);
    });
  });
});
