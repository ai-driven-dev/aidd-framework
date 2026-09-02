import { execFile as execFileCb } from "node:child_process";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { simpleGit } from "simple-git";
import type { TokenProvider } from "../../../domain/ports/token-provider.js";
import { injectTokenIntoUrl } from "../../../infrastructure/git/inject-token.js";
import { PluginFetchError } from "../../../kernel/errors.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type {
  PluginSource,
  PluginSourceGitHub,
  PluginSourceGitSubdir,
  PluginSourceNpm,
  PluginSourceUrl,
} from "../../../kernel/source.js";
import type { PluginFetcher, PluginFetchOptions } from "../domain/ports/plugin-fetcher.js";

const execFile = promisify(execFileCb);

const AUTH_ERROR_PATTERN =
  /Authentication failed|403|could not read Username|Permission denied \(publickey\)|Repository not found/i;

export class PluginFetcherAdapter implements PluginFetcher {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly tokenProvider?: TokenProvider
  ) {}

  async fetch(
    source: PluginSource,
    cacheDir: string,
    options?: PluginFetchOptions
  ): Promise<string> {
    const forceRefresh = options?.forceRefresh ?? false;
    switch (source.kind) {
      case "local":
        return this.fetchLocal(source.path);
      case "github":
        return this.fetchGitHub(source, cacheDir, forceRefresh);
      case "url":
        return this.fetchUrl(source, cacheDir, forceRefresh);
      case "git-subdir":
        return this.fetchGitSubdir(source, cacheDir, forceRefresh);
      case "npm":
        return this.fetchNpm(source, cacheDir, forceRefresh);
    }
  }

  private async fetchLocal(path: string): Promise<string> {
    const resolved = resolve(path);
    if (!(await this.fs.fileExists(resolved))) {
      throw new PluginFetchError(`local path does not exist: "${resolved}"`);
    }
    return resolved;
  }

  private async fetchGitHub(
    source: PluginSourceGitHub,
    cacheDir: string,
    forceRefresh: boolean
  ): Promise<string> {
    const baseUrl = `https://github.com/${source.repo}.git`;
    const key = `github-${source.repo.replace("/", "-")}-${source.ref ?? "HEAD"}`;
    const targetDir = join(cacheDir, key);
    await this.bustCacheIfNeeded(targetDir, forceRefresh);
    if (!(await this.fs.fileExists(targetDir))) {
      const token = (await this.tokenProvider?.resolve()) ?? undefined;
      await this.cloneShallow(injectTokenIntoUrl(baseUrl, token), baseUrl, targetDir, source.ref);
    }
    return targetDir;
  }

  private async fetchUrl(
    source: PluginSourceUrl,
    cacheDir: string,
    forceRefresh: boolean
  ): Promise<string> {
    const key = `${encodeKey(source.url)}${source.ref ? `-${source.ref}` : "-HEAD"}`;
    const targetDir = join(cacheDir, key);
    await this.bustCacheIfNeeded(targetDir, forceRefresh);
    if (!(await this.fs.fileExists(targetDir))) {
      const token = (await this.tokenProvider?.resolve()) ?? undefined;
      const authUrl = source.url.startsWith("git@")
        ? source.url
        : injectTokenIntoUrl(source.url, token);
      await this.cloneShallow(authUrl, source.url, targetDir, source.ref);
    }
    return targetDir;
  }

  private async fetchGitSubdir(
    source: PluginSourceGitSubdir,
    cacheDir: string,
    forceRefresh: boolean
  ): Promise<string> {
    const { url, path: subpath, ref } = source;
    const key = `${encodeKey(url)}-subdir-${subpath.replace(/\//g, "_")}-${ref ?? "HEAD"}`;
    const targetDir = join(cacheDir, key);
    await this.bustCacheIfNeeded(targetDir, forceRefresh);
    if (!(await this.fs.fileExists(targetDir))) {
      const token = (await this.tokenProvider?.resolve()) ?? undefined;
      const authUrl = url.startsWith("git@") ? url : injectTokenIntoUrl(url, token);
      await this.cloneSparse(authUrl, url, targetDir, subpath, ref);
    }
    return join(targetDir, subpath);
  }

  private async bustCacheIfNeeded(targetDir: string, forceRefresh: boolean): Promise<void> {
    if (forceRefresh && (await this.fs.fileExists(targetDir))) {
      await this.fs.deleteDirectory(targetDir);
    }
  }

  private async fetchNpm(
    source: PluginSourceNpm,
    cacheDir: string,
    forceRefresh: boolean
  ): Promise<string> {
    const { package: pkg, version } = source;
    const pkgDir = join(cacheDir, "node_modules", pkg);
    if (forceRefresh && (await this.fs.fileExists(pkgDir))) {
      await this.fs.deleteDirectory(pkgDir);
    }
    const spec = `${pkg}@${version ?? "latest"}`;
    try {
      await execFile("pnpm", ["add", "--prefix", cacheDir, "--", spec]);
    } catch (err) {
      throw new PluginFetchError(`npm install failed for "${spec}": ${String(err)}`);
    }
    return pkgDir;
  }

  private gitWithNoPrompt(baseDir?: string): ReturnType<typeof simpleGit> {
    const git = baseDir ? simpleGit(baseDir) : simpleGit();
    return git.env("GIT_TERMINAL_PROMPT", "0");
  }

  private async cloneShallow(
    authUrl: string,
    displayUrl: string,
    targetDir: string,
    ref?: string
  ): Promise<void> {
    const args = ["--depth", "1", ...(ref ? ["--branch", ref] : [])];
    try {
      await this.gitWithNoPrompt().clone(authUrl, targetDir, args);
    } catch (err) {
      this.classifyAndThrow(err, displayUrl);
    }
  }

  private async cloneSparse(
    authUrl: string,
    displayUrl: string,
    targetDir: string,
    subpath: string,
    ref?: string
  ): Promise<void> {
    try {
      await this.gitWithNoPrompt().clone(authUrl, targetDir, [
        "--filter=blob:none",
        "--no-checkout",
      ]);
      await this.gitWithNoPrompt(targetDir).raw(["sparse-checkout", "set", subpath]);
      await this.gitWithNoPrompt(targetDir).checkout(ref ?? "HEAD");
    } catch (err) {
      this.classifyAndThrow(err, displayUrl);
    }
  }

  private classifyAndThrow(err: unknown, displayUrl: string): never {
    const msg = err instanceof Error ? err.message : String(err);
    if (AUTH_ERROR_PATTERN.test(msg)) {
      throw new PluginFetchError(
        `Authentication failed for "${displayUrl}". ${this.authHint(displayUrl)}`
      );
    }
    throw new PluginFetchError(`git clone failed for "${displayUrl}": ${scrubCredentials(msg)}`);
  }

  private authHint(url: string): string {
    if (url.startsWith("git@")) {
      return "Check your SSH key is registered on the remote host.";
    }
    return "Set AIDD_TOKEN, run `aidd auth login`, or pass --token <value>. Required scope depends on the host (github: `repo`, gitlab: `read_repository`, bitbucket: `repository:read`).";
  }
}

// Truncation to 64 chars avoids filesystem path-length limits.
// URLs that differ only beyond position 64 will collide — acceptable for typical plugin URLs.
function encodeKey(url: string): string {
  return url.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 64);
}

function scrubCredentials(msg: string): string {
  return msg.replace(/https:\/\/[^@]+@/g, "https://");
}
