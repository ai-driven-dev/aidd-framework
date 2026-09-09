import type { AuthLogoutResult, CredentialStore } from "./ports/credential-store.js";

export class AuthLogoutUseCase {
  constructor(private readonly authProvider: CredentialStore) {}

  async execute(): Promise<AuthLogoutResult> {
    return await this.authProvider.logout();
  }
}
