import type { Logger } from "../../kernel/ports/logger.js";
import type { AuthConfig, AuthLevel, AuthMethod } from "./auth.js";
import type { AuthStorage } from "./auth-storage.js";
import type { TokenResolver } from "./ports/oauth-provider.js";
import type { TokenProvider } from "./ports/token-provider.js";

export interface AuthContext {
  token: string;
  method: AuthMethod;
  level: AuthLevel;
}

const noopExternalProvider: TokenResolver = { resolve: () => null };

export class AuthReaderAdapter implements TokenProvider {
  private cached?: Promise<string | null>;

  constructor(
    private readonly storage: AuthStorage,
    private readonly projectRoot: string,
    private readonly logger?: Logger,
    private readonly externalProvider: TokenResolver = noopExternalProvider,
    /** A token the command line carried: composed in, never published to the environment. */
    private readonly explicitToken?: string
  ) {}

  resolve(): Promise<string | null> {
    this.cached ??= this.resolveUncached();
    return this.cached;
  }

  private async resolveUncached(): Promise<string | null> {
    if (this.explicitToken) {
      this.logger?.debug("Token given on the command line");
      return this.explicitToken;
    }
    const envToken = process.env.AIDD_TOKEN;
    if (envToken) {
      this.logger?.debug("Token resolved from AIDD_TOKEN env");
      return envToken;
    }
    const projectConfig = await this.storage.read(this.storage.projectConfigPath(this.projectRoot));
    const fromProject = this.resolveFromConfig(projectConfig, "project");
    if (fromProject !== null) return fromProject;
    const userConfig = await this.storage.read(this.storage.userConfigPath());
    const fromUser = this.resolveFromConfig(userConfig, "user");
    if (fromUser !== null) return fromUser;
    this.logger?.debug("No token available");
    return null;
  }

  private resolveFromConfig(config: AuthConfig | null, label: string): string | null {
    if (config === null) return null;
    if (config.method === "stored" && config.token) {
      this.logger?.debug(`Token resolved from ${label} auth.json (stored)`);
      return config.token;
    }
    if (config.method === "external") {
      const token = this.externalProvider.resolve();
      if (token) {
        this.logger?.debug(`Token resolved from ${label} auth.json (external)`);
        return token;
      }
    }
    return null;
  }

  async resolveContext(projectRoot: string): Promise<AuthContext | null> {
    const token = await this.resolve();
    if (token === null) return null;

    const projectConfig = await this.storage.read(this.storage.projectConfigPath(projectRoot));
    const userConfig = await this.storage.read(this.storage.userConfigPath());
    const config = projectConfig ?? userConfig;

    return {
      token,
      method: config?.method ?? "stored",
      level: config?.level ?? "user",
    };
  }
}
