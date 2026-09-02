import { execSync } from "node:child_process";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AuthStorageError } from "../../kernel/errors.js";
import { AIDD_DIR } from "../../kernel/paths.js";
import { userConfigDir } from "../user-config-dir.js";
import type { AuthConfig, AuthCredential, AuthLevel } from "./auth.js";

interface SaveOptions {
  credential: AuthCredential;
  level: AuthLevel;
  projectRoot: string;
}

export class AuthStorage {
  private static readonly AUTH_FILE = "auth.json";

  userConfigPath(): string {
    return join(userConfigDir(), AuthStorage.AUTH_FILE);
  }

  projectConfigPath(projectRoot: string): string {
    return join(projectRoot, AIDD_DIR, AuthStorage.AUTH_FILE);
  }

  async read(path: string): Promise<AuthConfig | null> {
    try {
      const content = await readFile(path, "utf-8");
      const parsed = JSON.parse(content) as unknown;
      if (!isAuthConfig(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async write(path: string, config: AuthConfig): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(config, null, 2), "utf-8");
    if (process.platform === "win32") {
      try {
        execSync(`icacls "${path}" /inheritance:r /grant:r "%USERNAME%:(R,W)"`, {
          stdio: ["ignore", "ignore", "pipe"],
        });
      } catch (err) {
        throw new AuthStorageError(
          `Failed to set restrictive permissions on ${path}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      await chmod(path, 0o600);
    }
  }

  async delete(path: string): Promise<void> {
    await rm(path, { force: true });
  }

  async readActive(projectRoot: string): Promise<AuthConfig | null> {
    const envToken = process.env.AIDD_TOKEN;
    if (envToken) {
      return {
        version: 1,
        method: "stored",
        level: "user",
        token: envToken,
        createdAt: new Date().toISOString(),
      };
    }
    const projectConfig = await this.read(this.projectConfigPath(projectRoot));
    if (projectConfig !== null) return projectConfig;
    return this.read(this.userConfigPath());
  }

  async save(options: SaveOptions): Promise<void> {
    const config: AuthConfig = {
      version: 1,
      method: options.credential.method,
      level: options.level,
      createdAt: new Date().toISOString(),
      ...(options.credential.method === "stored"
        ? { token: options.credential.token }
        : { provider: options.credential.provider }),
    };
    const path =
      options.level === "project"
        ? this.projectConfigPath(options.projectRoot)
        : this.userConfigPath();
    await this.write(path, config);
  }
}

function isAuthConfig(value: unknown): value is AuthConfig {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.version === 1 &&
    (obj.method === "external" || obj.method === "stored") &&
    (obj.level === "user" || obj.level === "project") &&
    typeof obj.createdAt === "string"
  );
}
