import { AuthenticationError } from "../../kernel/errors.js";
import type { AuthConfig, AuthCredential, AuthLevel } from "./auth.js";
import type { CredentialFileStore } from "./ports/credential-file-store.js";
import type {
  AuthLoginResult,
  AuthLogoutHint,
  AuthLogoutResult,
  AuthStatus,
  CredentialStore,
} from "./ports/credential-store.js";
import type { CliAuthProvider, TokenAuthProvider } from "./ports/oauth-provider.js";

export class AuthProviderAdapter implements CredentialStore {
  constructor(
    private readonly storage: CredentialFileStore,
    private readonly externalProviders: Map<string, CliAuthProvider>,
    private readonly tokenVerifier: TokenAuthProvider,
    private readonly projectRoot: string
  ) {}

  async login(credential: AuthCredential, level: AuthLevel): Promise<AuthLoginResult> {
    const login =
      credential.method === "external"
        ? await this.resolveExternalProvider(credential.provider).verify()
        : await this.tokenVerifier.verifyToken(credential.token);
    await this.storage.save({ credential, level, projectRoot: this.projectRoot });
    return { login, level };
  }

  async status(): Promise<AuthStatus> {
    const config = await this.storage.readActive(this.projectRoot);
    if (config === null) return { authenticated: false };
    const login = await this.verifyConfig(config);
    return { authenticated: true, login, level: config.level };
  }

  async logout(): Promise<AuthLogoutResult> {
    const projectPath = this.storage.projectConfigPath(this.projectRoot);
    const projectConfig = await this.storage.read(projectPath);
    if (projectConfig !== null) {
      await this.storage.delete(projectPath);
      return {
        found: true,
        level: projectConfig.level,
        hint: this.logoutHint(projectConfig.method),
      };
    }
    const userPath = this.storage.userConfigPath();
    const userConfig = await this.storage.read(userPath);
    if (userConfig !== null) {
      await this.storage.delete(userPath);
      return { found: true, level: userConfig.level, hint: this.logoutHint(userConfig.method) };
    }
    return { found: false };
  }

  private async verifyConfig(config: AuthConfig): Promise<string> {
    if (config.method === "external") {
      return await this.resolveExternalProvider(config.provider ?? "gh").verify();
    }
    if (!config.token) throw new AuthenticationError("invalid config");
    return await this.tokenVerifier.verifyToken(config.token);
  }

  private resolveExternalProvider(provider: string): CliAuthProvider {
    const adapter = this.externalProviders.get(provider);
    if (!adapter) throw new AuthenticationError(`unknown external provider: ${provider}`);
    return adapter;
  }

  private logoutHint(method: AuthConfig["method"]): AuthLogoutHint | undefined {
    return method === "external" ? "external-provider-cleanup" : undefined;
  }
}
