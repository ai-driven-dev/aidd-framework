import type { TokenProvider } from "../../../src/runtime/auth/ports/token-provider.js";

/**
 * Returns a scripted token (or null) — no disk reads.
 */
export class FakeAuthReader implements TokenProvider {
  constructor(private readonly token: string | null = null) {}

  async resolve(): Promise<string | null> {
    return this.token;
  }
}
