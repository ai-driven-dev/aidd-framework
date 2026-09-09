import { execSync } from "node:child_process";
import { platform } from "node:os";
import {
  ElevatedPermissionUpdateError,
  FrameworkResolutionError,
  PackageManagerDetectionError,
  UpdateError,
} from "../../kernel/errors.js";
import type { Logger } from "../../kernel/ports/logger.js";
import type { TokenProvider } from "../auth/ports/token-provider.js";
import type { HttpGet } from "../http/http-client.js";
import type { CliRelease, SelfUpdater } from "./self-updater.js";

// release-please tags this package per component: `cli-v<semver>`, never a bare `v<semver>`,
// which is the root marketplace's. `fetchChangelog` swallows its own 404, so a wrong tag here
// costs the changelog silently.
const CLI_REPO = "ai-driven-dev/framework";
const CLI_TAG_PREFIX = "cli-v";
const CLI_PACKAGE = "@ai-driven-dev/cli";
const DEFAULT_GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_NPM_REGISTRY_BASE = "https://registry.npmjs.org";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

const PM_INSTALL_COMMANDS: Record<PackageManager, string> = {
  npm: `npm install -g ${CLI_PACKAGE}@latest`,
  pnpm: `pnpm add -g ${CLI_PACKAGE}@latest`,
  yarn: `yarn global add ${CLI_PACKAGE}@latest`,
  bun: `bun add -g ${CLI_PACKAGE}@latest`,
};

function detectPackageManager(): { pm: PackageManager; binaryPath: string } {
  const whichCommand = platform() === "win32" ? "where aidd" : "which aidd";
  let binaryPath: string;
  try {
    const raw = execSync(whichCommand, { encoding: "utf8" });
    // `where` on Windows may return one match per line.
    binaryPath = raw.trim().split(/\r?\n/)[0].trim();
  } catch {
    throw new PackageManagerDetectionError(Object.values(PM_INSTALL_COMMANDS));
  }
  const normalised = binaryPath.replace(/\\/g, "/");
  if (normalised.includes("/pnpm/")) return { pm: "pnpm", binaryPath };
  // yarn: ~/.yarn/bin (Unix) or AppData/Local/Yarn/bin (Windows)
  if (normalised.includes("/.yarn/") || normalised.toLowerCase().includes("/yarn/bin/"))
    return { pm: "yarn", binaryPath };
  // bun: ~/.bun/bin (Unix) or AppData\Local\bun (Windows)
  if (normalised.includes("/.bun/") || normalised.toLowerCase().includes("/bun/bin/"))
    return { pm: "bun", binaryPath };
  // npm installs to system paths (e.g. /usr/local/bin, ~/.npm-global/bin) with no pm marker
  return { pm: "npm", binaryPath };
}

function readString(body: unknown, key: string): string | null {
  const value = (body as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === "string" ? value : null;
}

interface SelfUpdaterAdapterConfig {
  tokenProvider?: TokenProvider;
  githubApiBase?: string;
  npmRegistryBase?: string;
  logger?: Logger;
}

export class SelfUpdaterAdapter implements SelfUpdater {
  private readonly tokenProvider: TokenProvider | undefined;
  private readonly githubApiBase: string;
  private readonly npmRegistryBase: string;
  private readonly logger: Logger | undefined;

  constructor(
    private readonly http: HttpGet,
    config: SelfUpdaterAdapterConfig = {}
  ) {
    this.tokenProvider = config.tokenProvider;
    this.githubApiBase = config.githubApiBase ?? DEFAULT_GITHUB_API_BASE;
    this.npmRegistryBase = config.npmRegistryBase ?? DEFAULT_NPM_REGISTRY_BASE;
    this.logger = config.logger;
  }

  async fetchLatestRelease(): Promise<CliRelease> {
    const version = await this.resolveLatestVersion();
    return { version, changelog: await this.fetchChangelog(version) };
  }

  // npm, not GitHub: it is the registry `npm install -g` pulls from, and it is reachable
  // without a token whether the GitHub repo is public or private.
  private async resolveLatestVersion(): Promise<string> {
    const url = `${this.npmRegistryBase}/-/package/${CLI_PACKAGE}/dist-tags`;
    try {
      // npm returns 406 for the client's default GitHub Accept — request plain JSON.
      const response = await this.http.get(url, { accept: "application/json" });
      const latest = readString(response.body, "latest");
      if (latest === null) {
        throw new FrameworkResolutionError(`Unexpected npm registry response from ${url}`);
      }
      return latest;
    } catch (err) {
      if (err instanceof FrameworkResolutionError) throw err;
      const detail = err instanceof Error ? err.message : String(err);
      throw new FrameworkResolutionError(
        `Could not resolve the latest CLI version from ${url}: ${detail}`
      );
    }
  }

  // Changelog is best-effort: the GitHub release body enriches the update notice
  // but is optional. A private repo without a token 404s here — swallow it.
  private async fetchChangelog(version: string): Promise<string | null> {
    const url = `${this.githubApiBase}/repos/${CLI_REPO}/releases/tags/${CLI_TAG_PREFIX}${version}`;
    const token = (await this.tokenProvider?.resolve()) ?? undefined;
    try {
      const response = await this.http.get(url, { token });
      return readString(response.body, "body");
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger?.debug(`Changelog unavailable from ${url}: ${detail}`);
      return null;
    }
  }

  install(): string {
    const { pm, binaryPath } = detectPackageManager();
    const command = PM_INSTALL_COMMANDS[pm];
    try {
      // stderr piped (not inherited) so EPERM/EACCES can be classified;
      // captured stderr is echoed back to the user before throwing.
      execSync(command, { stdio: ["inherit", "inherit", "pipe"] });
    } catch (err) {
      const stderr = extractStderr(err);
      if (stderr.length > 0) process.stderr.write(stderr);
      if (isPermissionError(stderr)) throw new ElevatedPermissionUpdateError(command);
      throw new UpdateError();
    }
    return binaryPath;
  }
}

function extractStderr(err: unknown): string {
  if (err === null || typeof err !== "object" || !("stderr" in err)) return "";
  const raw = (err as { stderr: unknown }).stderr;
  if (typeof raw === "string") return raw;
  if (raw instanceof Buffer) return raw.toString("utf8");
  return "";
}

function isPermissionError(stderr: string): boolean {
  return /\bEPERM\b|\bEACCES\b/.test(stderr);
}
