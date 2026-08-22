/**
 * Drives a tool's native plugin CLI, so the tool writes its own configuration.
 *
 * What each tool delegates differs. Codex and Copilot load plugins only from
 * user-global state their `<tool> plugin` subcommands populate, so both steps are
 * driven. Claude registers its marketplaces through its command but reads enabled
 * plugins from a project file this CLI writes, so only the registration is — driving
 * the rest would write exactly what is already written. Implementations shell out to
 * the binary declared by `NativeActivation.binary`.
 */
export interface NativePluginActivator {
  /** Returns true when the tool's CLI binary is callable on PATH. Never throws. */
  isAvailable(): boolean;
  /** Registers a marketplace source (local path, `owner/repo[@ref]`, or git URL). Idempotent. */
  addMarketplace(source: string): void;
  /** True when this tool enables plugins through its CLI rather than through a file. */
  enablesPlugins(): boolean;
  /** Unregisters a marketplace by name. May throw when absent — callers wrap it best-effort. */
  removeMarketplace(name: string): void;
  /** Refreshes marketplace snapshots so plugin installs pick up new versions. No-op when unsupported. */
  upgradeMarketplaces(): void;
  /** Installs and enables a plugin referenced as `<plugin>@<marketplace>`. Idempotent. */
  enablePlugin(pluginRef: string): void;
}
