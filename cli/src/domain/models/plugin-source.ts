import { isAbsolute } from "node:path";
import { InvalidPluginSourceError } from "../errors.js";

export const GITHUB_REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

// npm package name grammar: unscoped my-pkg or scoped @scope/name.
// Leading `-` or `.` is forbidden (would be parsed as a pnpm flag or relative path).
export const NPM_PACKAGE_NAME_REGEX = /^(?:@[a-z0-9][a-z0-9-._]*\/)?[a-z0-9][a-z0-9-._]*$/;
export const SHA_REGEX = /^[a-f0-9]{40}$/;

export interface PluginSourceGitHub {
  kind: "github";
  repo: string;
  ref?: string;
  sha?: string;
}

export interface PluginSourceUrl {
  kind: "url";
  url: string;
  ref?: string;
  sha?: string;
}

export interface PluginSourceGitSubdir {
  kind: "git-subdir";
  url: string;
  path: string;
  ref?: string;
  sha?: string;
}

export interface PluginSourceNpm {
  kind: "npm";
  package: string;
  version?: string;
  registry?: string;
}

export interface PluginSourceLocal {
  kind: "local";
  path: string;
}

export type PluginSource =
  | PluginSourceGitHub
  | PluginSourceUrl
  | PluginSourceGitSubdir
  | PluginSourceNpm
  | PluginSourceLocal;

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidPluginSourceError(`"${field}" must be a non-empty string.`);
  }
  return value;
}

function optionalString(raw: Record<string, unknown>, field: string): string | undefined {
  const value = raw[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new InvalidPluginSourceError(`"${field}" must be a string.`);
  }
  return value;
}

function optionalSha(raw: Record<string, unknown>): string | undefined {
  const value = optionalString(raw, "sha");
  if (value !== undefined && !SHA_REGEX.test(value)) {
    throw new InvalidPluginSourceError(`"sha" must be a 40-character lowercase hex string.`);
  }
  return value;
}

function parseGitHub(raw: Record<string, unknown>): PluginSourceGitHub {
  const repo = assertString(raw.repo, "repo");
  if (!GITHUB_REPO_REGEX.test(repo)) {
    throw new InvalidPluginSourceError(`"repo" must match owner/repo format.`);
  }
  return {
    kind: "github",
    repo,
    ref: optionalString(raw, "ref"),
    sha: optionalSha(raw),
  };
}

function parseUrl(raw: Record<string, unknown>): PluginSourceUrl {
  return {
    kind: "url",
    url: assertString(raw.url, "url"),
    ref: optionalString(raw, "ref"),
    sha: optionalSha(raw),
  };
}

function parseGitSubdir(raw: Record<string, unknown>): PluginSourceGitSubdir {
  return {
    kind: "git-subdir",
    url: assertString(raw.url, "url"),
    path: assertString(raw.path, "path"),
    ref: optionalString(raw, "ref"),
    sha: optionalSha(raw),
  };
}

function assertNpmPackageName(raw: Record<string, unknown>): string {
  const pkg = assertString(raw.package, "package");
  if (!NPM_PACKAGE_NAME_REGEX.test(pkg)) {
    throw new InvalidPluginSourceError(
      `"package" must be a valid npm package name (e.g. my-plugin or @scope/my-plugin). Got: "${pkg}"`
    );
  }
  return pkg;
}

function parseNpm(raw: Record<string, unknown>): PluginSourceNpm {
  return {
    kind: "npm",
    package: assertNpmPackageName(raw),
    version: optionalString(raw, "version"),
    registry: optionalString(raw, "registry"),
  };
}

function parseLocal(raw: Record<string, unknown>): PluginSourceLocal {
  return {
    kind: "local",
    path: assertString(raw.path, "path"),
  };
}

export function parsePluginSource(raw: unknown): PluginSource {
  if (typeof raw === "string") return parseStringPluginSource(raw);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidPluginSourceError("expected an object.");
  }
  return parseObjectPluginSource(raw as Record<string, unknown>);
}

function parseStringPluginSource(raw: string): PluginSource {
  // `isAbsolute` also catches a Windows-rooted path (`C:\...`, `\\server\share`), which
  // starts with neither `/` nor `./` (#707).
  if (raw.startsWith("./") || isAbsolute(raw)) return { kind: "local", path: raw };
  if (GITHUB_REPO_REGEX.test(raw)) return { kind: "github", repo: raw };
  throw new InvalidPluginSourceError(`string source "${raw}" is not a recognized path or repo.`);
}

function parseObjectPluginSource(obj: Record<string, unknown>): PluginSource {
  const kind = obj.kind;
  switch (kind) {
    case "github":
      return parseGitHub(obj);
    case "url":
      return parseUrl(obj);
    case "git-subdir":
      return parseGitSubdir(obj);
    case "npm":
      return parseNpm(obj);
    case "local":
      return parseLocal(obj);
    default:
      throw new InvalidPluginSourceError(
        `unknown kind "${String(kind)}". Expected: github, url, git-subdir, npm, local.`
      );
  }
}

const GITLAB_PREFIX = "gitlab:";

export function parsePluginSourceShorthand(raw: string): PluginSource {
  if (raw.startsWith("https://") || raw.startsWith("http://")) return { kind: "url", url: raw };
  if (raw.startsWith("git@")) return { kind: "url", url: raw };
  // `isAbsolute` also catches a Windows-rooted path (`C:\...`, `\\server\share`), which
  // starts with neither `/` nor `./` (#707).
  if (raw.startsWith("./") || isAbsolute(raw)) return { kind: "local", path: raw };
  if (raw.startsWith(GITLAB_PREFIX)) return parseGitLabShorthand(raw.slice(GITLAB_PREFIX.length));
  if (GITHUB_REPO_REGEX.test(raw)) return { kind: "github", repo: raw };
  const versioned = parseGitHubVersionedShorthand(raw);
  if (versioned !== null) return versioned;
  try {
    return parsePluginSource(JSON.parse(raw));
  } catch (err) {
    if (err instanceof InvalidPluginSourceError) throw err;
    throw new InvalidPluginSourceError(`unrecognized source format: "${raw}"`);
  }
}

function parseGitHubVersionedShorthand(raw: string): PluginSourceGitHub | null {
  const atIndex = raw.lastIndexOf("@");
  if (atIndex <= 0) return null;
  const repo = raw.slice(0, atIndex);
  const ref = raw.slice(atIndex + 1);
  if (!GITHUB_REPO_REGEX.test(repo)) return null;
  return { kind: "github", repo, ref };
}

function parseGitLabShorthand(raw: string): PluginSourceUrl {
  const atIndex = raw.lastIndexOf("@");
  const repo = atIndex > 0 ? raw.slice(0, atIndex) : raw;
  const ref = atIndex > 0 ? raw.slice(atIndex + 1) : undefined;
  if (!GITHUB_REPO_REGEX.test(repo)) {
    throw new InvalidPluginSourceError(
      `"gitlab:${raw}" must match gitlab:owner/repo or gitlab:owner/repo@ref`
    );
  }
  const result: PluginSourceUrl = { kind: "url", url: `https://gitlab.com/${repo}.git` };
  if (ref !== undefined) result.ref = ref;
  return result;
}

export function describePluginSource(src: PluginSource): string {
  switch (src.kind) {
    case "github":
      return `https://github.com/${src.repo}${src.ref ? `@${src.ref}` : ""}`;
    case "url":
      return src.url;
    case "git-subdir":
      return `${src.url}#${src.path}`;
    case "npm":
      return `npm:${src.package}${src.version ? `@${src.version}` : ""}`;
    case "local":
      return src.path;
  }
}

export function serializePluginSource(src: PluginSource): Record<string, unknown> {
  const result: Record<string, unknown> = { kind: src.kind };
  switch (src.kind) {
    case "github":
      result.repo = src.repo;
      if (src.ref !== undefined) result.ref = src.ref;
      if (src.sha !== undefined) result.sha = src.sha;
      break;
    case "url":
      result.url = src.url;
      if (src.ref !== undefined) result.ref = src.ref;
      if (src.sha !== undefined) result.sha = src.sha;
      break;
    case "git-subdir":
      result.url = src.url;
      result.path = src.path;
      if (src.ref !== undefined) result.ref = src.ref;
      if (src.sha !== undefined) result.sha = src.sha;
      break;
    case "npm":
      result.package = src.package;
      if (src.version !== undefined) result.version = src.version;
      if (src.registry !== undefined) result.registry = src.registry;
      break;
    case "local":
      result.path = src.path;
      break;
  }
  return result;
}
