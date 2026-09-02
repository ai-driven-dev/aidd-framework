import type { AuthStatus, CredentialStore } from "./ports/credential-store.js";

export class AuthStatusUseCase {
  constructor(private readonly authProvider: CredentialStore) {}

  async execute(): Promise<AuthStatus> {
    return await this.authProvider.status();
  }
}
