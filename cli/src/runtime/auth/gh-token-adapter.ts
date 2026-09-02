import { AuthenticationError } from "../../kernel/errors.js";
import type { HttpClient } from "../http/http-client.js";
import type { TokenAuthProvider } from "./ports/oauth-provider.js";

export class GhTokenAdapter implements TokenAuthProvider {
  constructor(private readonly http: HttpClient) {}

  async verifyToken(token: string): Promise<string> {
    const response = await this.http.get("https://api.github.com/user", { token });
    const body = response.body as Record<string, unknown>;
    if (typeof body.login !== "string") throw new AuthenticationError("GitHub API");
    return body.login;
  }
}
