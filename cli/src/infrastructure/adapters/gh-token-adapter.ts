import { AuthenticationError } from "../../domain/errors.js";
import type { TokenAuthProvider } from "../../domain/ports/oauth-provider.js";
import type { HttpGet } from "../http/http-client.js";

export class GhTokenAdapter implements TokenAuthProvider {
  constructor(private readonly http: HttpGet) {}

  async verifyToken(token: string): Promise<string> {
    const response = await this.http.get("https://api.github.com/user", { token });
    const body = response.body as Record<string, unknown>;
    if (typeof body.login !== "string") throw new AuthenticationError("GitHub API");
    return body.login;
  }
}
