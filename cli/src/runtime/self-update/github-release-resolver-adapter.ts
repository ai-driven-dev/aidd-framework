import {
  AuthenticationError,
  CatalogFetchAuthError,
  CatalogFetchError,
  HttpNotFoundError,
} from "../../kernel/errors.js";
import type { TokenProvider } from "../auth/ports/token-provider.js";
import type { HttpGet } from "../http/http-client.js";
import type { LatestReleaseResolver } from "./latest-release-resolver.js";

const GITHUB_API_BASE = "https://api.github.com";

/** Root release tag: `v` followed by a digit (`v4.0.0`, `v3.7.3-pm.1`). */
const ROOT_RELEASE_TAG_REGEX = /^v\d/;

export class GitHubReleaseResolverAdapter implements LatestReleaseResolver {
  constructor(
    private readonly http: HttpGet,
    private readonly tokenProvider?: TokenProvider
  ) {}

  async resolveLatest(repo: string): Promise<string | null> {
    // Use /releases?per_page=1 (not /releases/latest) — the latter excludes
    // prereleases. We want the most recent published release of any kind so
    // beta tags resolve too.
    const url = `${GITHUB_API_BASE}/repos/${repo}/releases?per_page=1`;
    const token = (await this.tokenProvider?.resolve()) ?? undefined;
    try {
      const response = await this.http.get(url, { token });
      const body = response.body as unknown[];
      if (!Array.isArray(body) || body.length === 0) return null;
      const first = body[0] as Record<string, unknown>;
      return typeof first.tag_name === "string" ? first.tag_name : null;
    } catch (err) {
      return this.handleError(err, url);
    }
  }

  async listRootReleases(repo: string): Promise<string[]> {
    // per_page=100 (GitHub max) so root tags are not buried under
    // release-please per-component tags on busy repos.
    const url = `${GITHUB_API_BASE}/repos/${repo}/releases?per_page=100`;
    const token = (await this.tokenProvider?.resolve()) ?? undefined;
    try {
      const response = await this.http.get(url, { token });
      const body = response.body as unknown[];
      if (!Array.isArray(body)) return [];
      return body
        .map((r) => (r as Record<string, unknown>).tag_name)
        .filter((t): t is string => typeof t === "string" && ROOT_RELEASE_TAG_REGEX.test(t));
    } catch (err) {
      this.handleError(err, url);
      return [];
    }
  }

  async isRepoPublic(repo: string): Promise<boolean> {
    // No token — probe unauthenticated reachability. A private/absent repo returns
    // 404; only that unambiguously means "auth required". Any other error resolves
    // true so a rate-limited or offline public user is not wrongly sent to login.
    const url = `${GITHUB_API_BASE}/repos/${repo}`;
    try {
      await this.http.get(url);
      return true;
    } catch (err) {
      return !(err instanceof HttpNotFoundError);
    }
  }

  private handleError(err: unknown, url: string): never | null {
    if (err instanceof HttpNotFoundError) return null;
    if (err instanceof AuthenticationError) throw new CatalogFetchAuthError(url);
    const detail = err instanceof Error ? err.message : String(err);
    throw new CatalogFetchError(url, detail);
  }
}
