import type { PluginFormat } from "./plugin-format.js";

export interface PluginManifestFields {
  name: string;
  version: string;
  description?: string;
  author?: { name: string; email?: string };
  strict?: boolean;
}

export interface PluginComponentFile {
  relativePath: string;
  content: string;
}

export interface PluginComponents {
  skills: readonly PluginComponentFile[];
  commands: readonly PluginComponentFile[];
  agents: readonly PluginComponentFile[];
  rules: readonly PluginComponentFile[];
  hooks: readonly PluginComponentFile[];
  mcp: readonly PluginComponentFile[];
}

export class PluginDistribution {
  readonly manifest: PluginManifestFields;
  readonly format: PluginFormat;
  readonly files: readonly PluginComponentFile[];
  readonly components: PluginComponents;

  constructor(params: {
    manifest: PluginManifestFields;
    format: PluginFormat;
    files: readonly PluginComponentFile[];
    components: PluginComponents;
  }) {
    this.manifest = params.manifest;
    this.format = params.format;
    this.files = params.files;
    this.components = params.components;
  }
}
