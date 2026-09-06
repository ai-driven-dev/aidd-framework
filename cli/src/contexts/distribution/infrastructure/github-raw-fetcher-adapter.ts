import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  AuthenticationError,
  CatalogFetchAuthError,
  CatalogFetchError,
  CatalogFetchNotFoundError,
  HttpNotFoundError,
} from "../../../kernel/errors.js";
import type { PluginSourceGitHub } from "../../../kernel/source.js";
import type { TokenProvider } from "../../../runtime/auth/ports/token-provider.js";
import type { HttpGet } from "../../../runtime/http/http-client.js";
import type { RawCatalogFetcher } from "../domain/ports/raw-catalog-fetcher.js";

const GITHUB_API_BASE = "https://api.github.com";
const RAW_ACCEPT = "application/vnd.github.raw";

export class GitHubRawFetcherAdapter implements RawCatalogFetcher {
  constructor(
    private readonly http: HttpGet,
    private readonly tokenProvider?: TokenProvider
  ) {}

  async fetchCatalog(
    source: PluginSourceGitHub,
    catalogPath: string,
    cacheDir: string
  ): Promise<string> {
    const ref = source.ref ?? "HEAD";
    try {
      const content = await this.fetchRaw(this.buildContentsUrl(source.repo, catalogPath, ref));
      return this.writeToCache(cacheDir, catalogPath, content);
    } catch (err) {
      if (ref === "HEAD" || !(err instanceof CatalogFetchNotFoundError)) throw err;
      const headContent = await this.fetchRaw(
        this.buildContentsUrl(source.repo, catalogPath, "HEAD")
      );
      return this.writeToCache(cacheDir, catalogPath, headContent);
    }
  }

  private buildContentsUrl(repo: string, catalogPath: string, ref: string): string {
    return `${GITHUB_API_BASE}/repos/${repo}/contents/${catalogPath}?ref=${ref}`;
  }

  private async fetchRaw(url: string): Promise<string> {
    const token = (await this.tokenProvider?.resolve()) ?? undefined;
    try {
      const response = await this.http.get(url, {
        token,
        accept: RAW_ACCEPT,
      });
      const body = response.body;
      if (Buffer.isBuffer(body)) return body.toString("utf-8");
      return JSON.stringify(body);
    } catch (err) {
      this.classifyAndThrow(err, url);
    }
  }

  private classifyAndThrow(err: unknown, url: string): never {
    if (err instanceof HttpNotFoundError) throw new CatalogFetchNotFoundError(url);
    if (err instanceof AuthenticationError) throw new CatalogFetchAuthError(url);
    const detail = err instanceof Error ? err.message : String(err);
    throw new CatalogFetchError(url, detail);
  }

  private async writeToCache(
    cacheDir: string,
    catalogPath: string,
    content: string
  ): Promise<string> {
    const filePath = join(cacheDir, catalogPath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
    return cacheDir;
  }
}
