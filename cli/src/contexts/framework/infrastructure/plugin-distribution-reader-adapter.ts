import { join } from "node:path";
import {
  InvalidPluginManifestError,
  InvalidPluginNameError,
  InvalidPluginVersionError,
} from "../../../kernel/errors.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import { isSemver } from "../../../kernel/semver.js";
import {
  type PluginComponentFile,
  type PluginComponents,
  PluginDistribution,
  type PluginManifestFields,
} from "../../translate/domain/plugin-distribution.js";
import type { PluginFormat } from "../../translate/domain/plugin-format.js";
import { pluginManifestProbes } from "../../translate/domain/plugin-format.js";
import { PLUGIN_NAME_REGEX } from "../domain/plugins/installed-plugin.js";
import type { PluginDistributionReader } from "../domain/ports/plugin-distribution-reader.js";

const README_FILENAME = "README.md";

export class PluginDistributionReaderAdapter implements PluginDistributionReader {
  constructor(private readonly fs: FileReader) {}

  async read(pluginRoot: string): Promise<PluginDistribution> {
    const { format, manifestPath, manifestRelativePath } = await this.probeManifest(pluginRoot);
    const manifest = await this.readManifest(manifestPath);
    const files = await this.collectFiles(pluginRoot, manifestPath, manifestRelativePath);
    const components = categorize(files);
    return new PluginDistribution({ manifest, format, files, components });
  }

  private async probeManifest(
    pluginRoot: string
  ): Promise<{ format: PluginFormat; manifestPath: string; manifestRelativePath: string }> {
    for (const probe of pluginManifestProbes()) {
      const fullPath = join(pluginRoot, probe.relativePath);
      if (await this.fs.fileExists(fullPath)) {
        return {
          format: probe.format,
          manifestPath: fullPath,
          manifestRelativePath: probe.relativePath,
        };
      }
    }
    throw new InvalidPluginManifestError(`no plugin.json found in "${pluginRoot}"`);
  }

  private async readManifest(manifestPath: string): Promise<PluginManifestFields> {
    let raw: unknown;
    try {
      raw = JSON.parse(await this.fs.readFile(manifestPath));
    } catch {
      throw new InvalidPluginManifestError("plugin.json is not valid JSON");
    }
    return validateManifest(raw);
  }

  private async collectFiles(
    pluginRoot: string,
    manifestPath: string,
    manifestRelativePath: string
  ): Promise<PluginComponentFile[]> {
    const allPaths = await this.fs.listDirectory(pluginRoot);
    const files: PluginComponentFile[] = [];
    for (const rawPath of allPaths) {
      const relativePath = toPosix(rawPath);
      if (relativePath === README_FILENAME) continue;
      if (!isComponentFile(relativePath)) continue;
      const content = await this.fs.readFile(join(pluginRoot, rawPath));
      files.push({ relativePath, content });
    }
    const manifestContent = await this.fs.readFile(manifestPath);
    files.push({ relativePath: manifestRelativePath, content: manifestContent });
    return files;
  }
}

function toPosix(p: string): string {
  return p.split("\\").join("/");
}

function isComponentFile(relativePath: string): boolean {
  const top = relativePath.split("/")[0];
  if (top === "skills" || top === "commands" || top === "agents" || top === "rules") return true;
  if (top === "hooks") return true;
  if (relativePath === ".mcp.json") return true;
  return false;
}

function validateManifest(raw: unknown): PluginManifestFields {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidPluginManifestError("plugin.json must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;

  const name = obj.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new InvalidPluginManifestError('"name" must be a non-empty string');
  }
  if (!PLUGIN_NAME_REGEX.test(name)) {
    throw new InvalidPluginNameError(name);
  }

  const version = obj.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new InvalidPluginManifestError('"version" must be a non-empty string');
  }
  if (!isSemver(version)) {
    throw new InvalidPluginVersionError(version);
  }

  const result: PluginManifestFields = { name, version };

  if (typeof obj.description === "string") result.description = obj.description;
  if (typeof obj.strict === "boolean") result.strict = obj.strict;
  if (obj.author !== null && typeof obj.author === "object" && !Array.isArray(obj.author)) {
    const a = obj.author as Record<string, unknown>;
    if (typeof a.name === "string") {
      result.author = { name: a.name };
      if (typeof a.email === "string") result.author.email = a.email;
    }
  }

  return result;
}

function categorize(files: readonly PluginComponentFile[]): PluginComponents {
  const skills: PluginComponentFile[] = [];
  const commands: PluginComponentFile[] = [];
  const agents: PluginComponentFile[] = [];
  const rules: PluginComponentFile[] = [];
  const hooks: PluginComponentFile[] = [];
  const mcp: PluginComponentFile[] = [];

  for (const file of files) {
    if (file.relativePath === ".mcp.json") {
      mcp.push(file);
      continue;
    }
    const top = file.relativePath.split("/")[0];
    if (top === "skills") skills.push(file);
    else if (top === "commands") commands.push(file);
    else if (top === "agents") agents.push(file);
    else if (top === "rules") rules.push(file);
    else if (top === "hooks") hooks.push(file);
  }

  return { skills, commands, agents, rules, hooks, mcp };
}
