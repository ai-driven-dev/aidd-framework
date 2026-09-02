import type { ToolCategory } from "./tools/registry.js";

export class CapabilityConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityConfigError";
  }
}

export class CursorProjectScopeUnsupportedError extends Error {
  constructor() {
    super(
      "Cursor plugins only support user-scope install (~/.cursor/plugins/local/). Project-scope is not auto-loaded by Cursor."
    );
    this.name = "CursorProjectScopeUnsupportedError";
  }
}

export class InvalidPluginScopeError extends Error {
  constructor(toolId: string, requested: "project" | "user", supported: "project" | "user") {
    super(
      `Tool '${toolId}' does not support scope '${requested}'. Supported scope: '${supported}'. ` +
        `Re-run with --scope ${supported} or omit the flag.`
    );
    this.name = "InvalidPluginScopeError";
  }
}

export class AuthenticationError extends Error {
  constructor(source: string) {
    super(`Authentication failed (${source}). Run \`aidd auth login\` to authenticate.`);
    this.name = "AuthenticationError";
  }
}

export class UpdateError extends Error {
  constructor() {
    super(
      "Update failed. If you saw a 403 error above, ensure your GitHub token includes both repo and read:packages scopes.\n" +
        "Update your token at https://github.com/settings/tokens, then re-run `aidd auth login`."
    );
    this.name = "UpdateError";
  }
}

export class ElevatedPermissionUpdateError extends Error {
  constructor(installCommand: string) {
    super(
      "Update failed: the global package directory is not writable (EPERM/EACCES).\n" +
        "Pick one:\n" +
        "  1. Run the terminal as Administrator (Windows) or with sudo (macOS/Linux), then re-run `aidd self-update`.\n" +
        "  2. Move global installs to a user-writable prefix, then re-run the update:\n" +
        "     Windows:  npm config set prefix %APPDATA%\\npm\n" +
        "     macOS/Linux:  npm config set prefix ~/.npm-global\n" +
        `  3. Run the update directly: ${installCommand}`
    );
    this.name = "ElevatedPermissionUpdateError";
  }
}

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestValidationError";
  }
}

export class McpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpConfigError";
  }
}

export class FrameworkResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameworkResolutionError";
  }
}

export class InvalidToolIdError extends Error {
  constructor(invalid: string[], validToolIds: readonly string[]) {
    super(`Unknown tool(s): ${invalid.join(", ")}. Valid tools: ${validToolIds.join(", ")}`);
    this.name = "InvalidToolIdError";
  }
}

export class CategoryMismatchError extends Error {
  constructor(wrong: string[], category: ToolCategory, validToolIds: readonly string[]) {
    const label = category === "ai" ? "AI" : "IDE";
    const verb = wrong.length === 1 ? `is not an ${label} tool` : `are not ${label} tools`;
    super(`${wrong.join(", ")} ${verb}. Valid ${label} tools: ${validToolIds.join(", ")}`);
    this.name = "CategoryMismatchError";
  }
}

export class UnregisteredToolError extends Error {
  constructor(toolId: string) {
    super(`Tool '${toolId}' is not registered.`);
    this.name = "UnregisteredToolError";
  }
}

export class ToolNotInManifestError extends Error {
  constructor(toolId: string) {
    super(`Tool '${toolId}' is not installed in the manifest.`);
    this.name = "ToolNotInManifestError";
  }
}

export class InvalidManifestDataError extends Error {
  constructor(detail?: string) {
    super(detail ? `Invalid manifest data: ${detail}` : "Invalid manifest data.");
    this.name = "InvalidManifestDataError";
  }
}

export class InvalidManifestToolIdError extends Error {
  constructor(key: string) {
    super(`Invalid tool id in manifest: '${key}'.`);
    this.name = "InvalidManifestToolIdError";
  }
}

export class InvalidMcpServerConfigError extends Error {
  constructor(name: string) {
    super(`MCP server "${name}" must have either a "command" or "url" field`);
    this.name = "InvalidMcpServerConfigError";
  }
}

export class OpencodeDualConfigError extends Error {
  constructor() {
    super("Both opencode.json and opencode.jsonc exist. Remove one.");
    this.name = "OpencodeDualConfigError";
  }
}

export class KiloDualConfigError extends Error {
  constructor() {
    super("Both kilo.json and kilo.jsonc exist. Remove one.");
    this.name = "KiloDualConfigError";
  }
}

export class PackageManagerDetectionError extends Error {
  constructor(commands: readonly string[]) {
    super(`Could not detect package manager. Run manually:\n  ${commands.join("\n  ")}`);
    this.name = "PackageManagerDetectionError";
  }
}

export class InvalidPluginSourceError extends Error {
  constructor(detail?: string) {
    super(detail ? `Invalid plugin source: ${detail}` : "Invalid plugin source.");
    this.name = "InvalidPluginSourceError";
  }
}

export class InvalidPluginNameError extends Error {
  constructor(name: string) {
    super(
      `Invalid plugin name: "${name}". Use lowercase alphanumeric characters and hyphens only.`
    );
    this.name = "InvalidPluginNameError";
  }
}

export class InvalidPluginVersionError extends Error {
  constructor(version: string) {
    super(`Invalid plugin version: "${version}". Expected semver format (e.g. 1.0.0).`);
    this.name = "InvalidPluginVersionError";
  }
}

export class InvalidPluginManifestError extends Error {
  constructor(detail?: string) {
    super(detail ? `Invalid plugin manifest: ${detail}` : "Invalid plugin manifest.");
    this.name = "InvalidPluginManifestError";
  }
}

// Thrown when a marketplace catalog file (.claude-plugin/marketplace.json or
// .plugin/marketplace.json) exists but cannot be parsed. Extends
// InvalidPluginManifestError so existing `instanceof` checks still hold, while
// adding an actionable recovery hint — a cached catalog is healed by re-fetch,
// a user-provided source must be fixed by hand.
export class MalformedMarketplaceCatalogError extends InvalidPluginManifestError {
  constructor(path: string, detail: string, cached: boolean) {
    const recovery = cached
      ? "Run 'aidd marketplace refresh --force' to re-fetch a clean copy."
      : "Fix or re-create the marketplace catalog file.";
    super(`catalog at "${path}" is malformed (${detail}). ${recovery}`);
    this.name = "MalformedMarketplaceCatalogError";
  }
}

export class PluginNotFoundError extends Error {
  constructor(name: string) {
    super(`Plugin '${name}' is not installed.`);
    this.name = "PluginNotFoundError";
  }
}

export class DuplicatePluginError extends Error {
  constructor(name: string) {
    super(`Plugin '${name}' is already installed.`);
    this.name = "DuplicatePluginError";
  }
}

export class PluginFetchError extends Error {
  constructor(detail: string) {
    super(`Failed to fetch plugin: ${detail}`);
    this.name = "PluginFetchError";
  }
}

export class InvalidMarketplaceNameError extends Error {
  constructor(detail: string) {
    super(
      `Invalid marketplace name: "${detail}". Use lowercase alphanumeric characters and hyphens only.`
    );
    this.name = "InvalidMarketplaceNameError";
  }
}

export class InvalidMarketplaceScopeError extends Error {
  constructor(scope: string) {
    super(`Invalid marketplace scope: "${scope}". Expected "project" or "user".`);
    this.name = "InvalidMarketplaceScopeError";
  }
}

export class MarketplaceAlreadyRegisteredError extends Error {
  constructor(name: string) {
    super(`Marketplace '${name}' is already registered.`);
    this.name = "MarketplaceAlreadyRegisteredError";
  }
}

export class MarketplaceNotFoundError extends Error {
  constructor(name: string) {
    super(`Marketplace '${name}' is not registered.`);
    this.name = "MarketplaceNotFoundError";
  }
}

export class TrustDeniedError extends Error {
  constructor(name: string) {
    super(`Trust denied for marketplace '${name}'. Aborting.`);
    this.name = "TrustDeniedError";
  }
}

export class PluginNotInMarketplaceError extends Error {
  constructor(plugin: string) {
    super(`Plugin '${plugin}' was not found in any registered marketplace.`);
    this.name = "PluginNotInMarketplaceError";
  }
}

export class VersionMismatchError extends Error {
  constructor(plugin: string, requested: string, actual: string) {
    super(
      `Plugin '${plugin}': requested version '${requested}' does not match catalog version '${actual}'.`
    );
    this.name = "VersionMismatchError";
  }
}

export class AmbiguousPluginMatchError extends Error {
  constructor(plugin: string, marketplaces: readonly string[]) {
    super(
      `Plugin '${plugin}' matches multiple marketplaces: ${marketplaces.join(", ")}. Use --from <marketplace>.`
    );
    this.name = "AmbiguousPluginMatchError";
  }
}

export class NoMarketplacesRegisteredError extends Error {
  constructor() {
    super("No marketplaces registered. Use `aidd plugin marketplace add <source>` first.");
    this.name = "NoMarketplacesRegisteredError";
  }
}

export class InteractiveOnlyError extends Error {
  constructor(action: string) {
    super(`'${action}' requires an interactive terminal.`);
    this.name = "InteractiveOnlyError";
  }
}

export class ForeignSchemaValidationError extends Error {
  constructor(source: string, detail: string) {
    super(`Foreign marketplace schema validation failed (${source}): ${detail}`);
    this.name = "ForeignSchemaValidationError";
  }
}

export class CatalogFetchNotFoundError extends Error {
  constructor(url: string) {
    super(`Catalog not found (HTTP 404): ${url}`);
    this.name = "CatalogFetchNotFoundError";
  }
}

export class CatalogFetchAuthError extends Error {
  constructor(url: string) {
    super(
      `Authentication required to fetch catalog from "${url}". Run \`aidd auth login\` first or use \`--source local --path <dir>\`.`
    );
    this.name = "CatalogFetchAuthError";
  }
}

export class CatalogFetchError extends Error {
  constructor(url: string, detail: string) {
    super(`Failed to fetch catalog from "${url}": ${detail}`);
    this.name = "CatalogFetchError";
  }
}

export class MissingPluginMetadataError extends Error {
  constructor() {
    super("Cannot register github marketplace plugin: catalog entry is missing plugin metadata.");
    this.name = "MissingPluginMetadataError";
  }
}

export class InvalidPluginComponentKindError extends Error {
  constructor(kind: string) {
    super(`Invalid kind: "${kind}". Valid: skills|agents|hooks|mcp|full.`);
    this.name = "InvalidPluginComponentKindError";
  }
}

export class JsonSchemaValidationError extends Error {
  constructor(errors: string[]) {
    super(`Manifest validation failed: ${errors.join("; ")}`);
    this.name = "JsonSchemaValidationError";
  }
}

export class PluginTargetExistsError extends Error {
  constructor(path: string) {
    super(`Directory '${path}' already exists. Use '--force' to overwrite.`);
    this.name = "PluginTargetExistsError";
  }
}

export class MarketplaceEntryAlreadyExistsError extends Error {
  constructor(name: string, index: number, marketplacePath: string) {
    super(`Plugin '${name}' already in ${marketplacePath} at index ${index}.`);
    this.name = "MarketplaceEntryAlreadyExistsError";
  }
}

export class FrameworkPlaceholderInPluginError extends Error {
  constructor(pluginName: string, relativePath: string) {
    super(
      `Framework placeholder '@{{TOOLS}}/' is not allowed inside plugin '${pluginName}' (file: ${relativePath}).`
    );
    this.name = "FrameworkPlaceholderInPluginError";
  }
}

export class InvalidBuildPathsError extends Error {
  constructor(sourceDir: string, outDir: string) {
    super(
      `Refusing to build: --out '${outDir}' and --source '${sourceDir}' must not contain each other.`
    );
    this.name = "InvalidBuildPathsError";
  }
}

export class InvalidSourceMarketplaceError extends Error {
  constructor(detail: string) {
    super(`Invalid source marketplace: ${detail}.`);
    this.name = "InvalidSourceMarketplaceError";
  }
}

export class OutDirNotDirectoryError extends Error {
  constructor(outDir: string) {
    super(`Refusing to build: --out '${outDir}' does not exist or is not a directory.`);
    this.name = "OutDirNotDirectoryError";
  }
}

export class FlatTargetExistsError extends Error {
  constructor(targetPath: string, pluginName: string) {
    super(
      `Flat build conflict: '${targetPath}' already exists (plugin '${pluginName}'). ` +
        "Re-run with --force to overwrite."
    );
    this.name = "FlatTargetExistsError";
  }
}

export class UnknownToolCategoryError extends Error {
  constructor(category: string) {
    super(`Unknown category: ${category}`);
    this.name = "UnknownToolCategoryError";
  }
}

export class MarketplaceSourceKindError extends Error {
  constructor(expected: "remote" | "local") {
    super(expected === "remote" ? "Not a remote source" : "Not a local source");
    this.name = "MarketplaceSourceKindError";
  }
}

export class EmptyLocalSourcePathError extends Error {
  constructor() {
    super("Local source path must not be empty.");
    this.name = "EmptyLocalSourcePathError";
  }
}

export class InvalidSetupToolIdError extends Error {
  constructor(id: string, validIds: readonly string[]) {
    super(`Invalid tool ID: "${id}". Valid IDs: ${validIds.join(", ")}`);
    this.name = "InvalidSetupToolIdError";
  }
}

export class InvalidPluginModeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPluginModeConfigError";
  }
}

export class InvalidInstallScopeError extends Error {
  constructor(value: string) {
    super(`Invalid scope '${value}'. Expected 'project' or 'user'.`);
    this.name = "InvalidInstallScopeError";
  }
}

export class UnknownAiToolIdError extends Error {
  constructor(tool: string, validIds: readonly string[]) {
    super(`Unknown AI tool: ${tool}. Valid AI tools: ${validIds.join(", ")}`);
    this.name = "UnknownAiToolIdError";
  }
}

export class EmptyMarketplaceCacheNameError extends Error {
  constructor() {
    super("MarketplaceCacheEntry: name must not be empty");
    this.name = "EmptyMarketplaceCacheNameError";
  }
}

export class NativePluginCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NativePluginCliError";
  }
}
