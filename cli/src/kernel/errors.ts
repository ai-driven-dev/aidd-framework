import type { ToolCategory } from "./tool.js";

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
        "  1. Run the terminal as Administrator (Windows) or with sudo (macOS/Linux), then re-run `aidd update`.\n" +
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
    super("No marketplaces registered. Use `aidd marketplace add <name> <source>` first.");
    this.name = "NoMarketplacesRegisteredError";
  }
}

/** The registry file exists but cannot be read as one is never read as an empty registry:
 * `save()` reads this same list, appends to it and writes the whole file back, so a silent
 * empty read would not merely hide the marketplaces a person registered, it would delete
 * them on the very next write. Modeled on `UnreadableIdentityFileError`, the same situation
 * for the other user-config file this CLI shares with whoever edits it. */
export class UnreadableMarketplaceRegistryError extends Error {
  constructor(path: string, reason: string) {
    super(
      `Cannot read the marketplace registry at ${path}: ${reason}. Repair the file, or ` +
        `delete it to start from an empty registry.`
    );
    this.name = "UnreadableMarketplaceRegistryError";
  }
}

export class InteractiveOnlyError extends Error {
  constructor(action: string) {
    super(`'${action}' requires an interactive terminal.`);
    this.name = "InteractiveOnlyError";
  }
}

/** `sync` restoring one scope out of several and failing another is not a silent partial
 * success: each failure already reached the user through its own `output.warn` line, so
 * this names only the scopes, not the messages again, and lets `errorHandler` be the one
 * place that turns a failed sync into a non-zero exit. */
export class SyncFailedError extends Error {
  constructor(errors: readonly { scope: string; message: string }[]) {
    super(`Sync failed for: ${errors.map((e) => e.scope).join(", ")}. See the warnings above.`);
    this.name = "SyncFailedError";
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

export class JsonSchemaValidationError extends Error {
  constructor(errors: string[]) {
    super(`Manifest validation failed: ${errors.join("; ")}`);
    this.name = "JsonSchemaValidationError";
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

export class NativePluginCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NativePluginCliError";
  }
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly url: string
  ) {
    super(`Unexpected HTTP ${statusCode} from ${url}`);
    this.name = "HttpError";
  }
}

export class HttpNotFoundError extends Error {
  constructor(readonly url: string) {
    super(`Resource not found (HTTP 404): ${url}`);
    this.name = "HttpNotFoundError";
  }
}

export class HttpRedirectError extends Error {
  constructor(readonly url: string) {
    super(`HTTP redirect without location header from ${url}`);
    this.name = "HttpRedirectError";
  }
}

export class JsonParseError extends Error {
  constructor(path: string, cause: string) {
    super(`Cannot parse existing JSON at ${path}: ${cause}`);
    this.name = "JsonParseError";
  }
}

export class AuthStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthStorageError";
  }
}

export class GhCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhCliError";
  }
}

export class AssetNotFoundError extends Error {
  constructor(assetName: string) {
    super(`Bundled asset not found: '${assetName}'`);
    this.name = "AssetNotFoundError";
  }
}
export class NoManifestError extends Error {
  constructor() {
    super("No AIDD manifest found. Run `aidd setup` to initialize your project.");
    this.name = "NoManifestError";
  }
}

export class AiddFilesDetectedError extends Error {
  constructor() {
    super(
      "AIDD files detected but no manifest found.\nRun `aidd setup` to register existing files."
    );
    this.name = "AiddFilesDetectedError";
  }
}

export class AlreadyInitializedError extends Error {
  constructor(message = "Already initialized. Use `aidd update` to upgrade.") {
    super(message);
    this.name = "AlreadyInitializedError";
  }
}

export class InputRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputRequiredError";
  }
}

export class ToolNotInstalledError extends Error {
  constructor(toolId: string, context?: string) {
    super(context ? `${context} '${toolId}' is not installed.` : `${toolId} is not installed`);
    this.name = "ToolNotInstalledError";
  }
}

export class UnknownTelemetrySinkSchemaVersionError extends Error {
  constructor(version: unknown) {
    super(
      `Unknown telemetry sink schema version '${String(version)}' — refusing to guess its shape.`
    );
    this.name = "UnknownTelemetrySinkSchemaVersionError";
  }
}

/** A genuine `opencode export` failure — a non-zero exit not explained by "no such
 * session", or the command exceeding its timeout. An absent binary or an unknown session
 * are not this: those mean the machine simply holds no OpenCode data, and the reader
 * resolves to an empty array for them instead of throwing. */
export class OpencodeExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpencodeExportError";
  }
}

export class InvalidReportDayError extends Error {
  constructor(flag: string, value: string) {
    super(`Invalid ${flag} '${value}'. Expected a UTC day, as YYYY-MM-DD.`);
    this.name = "InvalidReportDayError";
  }
}

export class InvalidReportSpanError extends Error {
  constructor(value: string, maxDays: number) {
    super(`Invalid --days '${value}'. Expected an integer between 1 and ${maxDays}.`);
    this.name = "InvalidReportSpanError";
  }
}

/** The identity file exists but could not be read back — a read failure (e.g. it is a
 * directory) or content that does not parse. Distinct from no file at all, which is a
 * person never having opted in and answers `null` rather than throwing.
 *
 * Also what a damaged separate declaration file would have thrown, back when one existed
 * as its own file (`UnreadablePersonMappingFileError`, deleted alongside it): one file,
 * one error for a read that could not come back. */
export class UnreadableIdentityFileError extends Error {
  constructor(filePath: string, cause: string) {
    super(`Could not read the identity file at ${filePath} (${cause}).`);
    this.name = "UnreadableIdentityFileError";
  }
}

/** One sentence for one consequence: writing a git-tracked file that turns telemetry on for
 * everyone who clones. `endpoint --scope project` and `telemetry on` both have exactly this
 * consequence — the parameterised `action` and `trackedPath` are the only two things that
 * differ between them, so they share the one error rather than each writing its own
 * sentence for the same fact. */
export class TelemetryProjectScopeRequiresYesError extends Error {
  constructor(action: string, trackedPath: string) {
    super(
      `${action} writes the git-tracked ${trackedPath}, turning telemetry on for ` +
        "everyone who clones. Pass --yes to confirm."
    );
    this.name = "TelemetryProjectScopeRequiresYesError";
  }
}

export class EmptyDisplayNameError extends Error {
  constructor() {
    super("`aidd telemetry identity use --name` needs a non-empty value.");
    this.name = "EmptyDisplayNameError";
  }
}

export class IdentityRequiredToLinkError extends Error {
  constructor() {
    super("No identity to link onto yet. Run `aidd telemetry identity use` first.");
    this.name = "IdentityRequiredToLinkError";
  }
}

export class EmptyIdentifierError extends Error {
  constructor(command: "use" | "link") {
    super(`\`aidd telemetry identity ${command}\` needs a non-empty value.`);
    this.name = "EmptyIdentifierError";
  }
}
export class TelemetrySinkUnwritableError extends Error {
  constructor(path: string, cause: unknown) {
    super(
      `Telemetry sink directory is not writable: ${path} ` +
        `(${cause instanceof Error ? cause.message : String(cause)})`
    );
    this.name = "TelemetrySinkUnwritableError";
  }
}

/** A write or a delete against the identity file failed for a reason other than the file
 * simply not being there — permission denied, a full disk, and the like. Distinct from
 * `UnreadableIdentityFileError`, above: that one names a read that could not
 * come back, this one a write or a forget that could not go out. */
export class IdentityWriteError extends Error {
  /** `action` names what the person was doing, because the sentence reaches them: someone
   * withdrawing should not be told a write failed. */
  constructor(filePath: string, cause: unknown, action: "write" | "remove" = "write") {
    super(
      `Could not ${action} the identity file at ${filePath} ` +
        `(${cause instanceof Error ? cause.message : String(cause)}).`
    );
    this.name = "IdentityWriteError";
  }
}
