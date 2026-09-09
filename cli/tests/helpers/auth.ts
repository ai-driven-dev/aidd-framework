import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuthConfig } from "../../src/runtime/auth/auth.js";
import { AuthStorage } from "../../src/runtime/auth/auth-storage.js";

export async function makeTempAuthStorage(prefix: string): Promise<{
  tempDir: string;
  storage: AuthStorage;
  cleanup: () => Promise<void>;
}> {
  const tempDir = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const real = new AuthStorage();
  const storage = Object.create(real) as AuthStorage;
  storage.userConfigPath = () => join(tempDir, "user-auth.json");
  return {
    tempDir,
    storage,
    cleanup: () => rm(tempDir, { recursive: true, force: true }),
  };
}

export function makeAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    version: 1,
    method: "stored",
    level: "user",
    token: "ghp_test",
    createdAt: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}
