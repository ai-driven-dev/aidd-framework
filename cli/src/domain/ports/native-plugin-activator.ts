/**
 * Drives a tool's native plugin CLI to register marketplaces and enable plugins.
 *
 * Some tools (Codex, Copilot) only load plugins from user-global state populated by
 * their `<tool> plugin` subcommands — writing a project-local config does not enable
 * a plugin. Implementations shell out to the tool's CLI binary. Each implementation
 * targets one binary; the binary it serves is declared via `NativeActivation.binary`.
 */
export interface NativePluginActivator {
  /** Returns true when the tool's CLI binary is callable on PATH. Never throws. */
  isAvailable(): boolean;
  /** Registers a marketplace source (local path, `owner/repo[@ref]`, or git URL). Idempotent. */
  addMarketplace(source: string): void;
  /** Unregisters a marketplace by name. May throw when absent — callers wrap it best-effort. */
  removeMarketplace(name: string): void;
  /** Refreshes marketplace snapshots so plugin installs pick up new versions. */
  upgradeMarketplaces(): void;
  /** Installs and enables a plugin referenced as `<plugin>@<marketplace>`. Idempotent. */
  enablePlugin(pluginRef: string): void;
  /**
   * Uninstalls a plugin referenced as `<plugin>@<marketplace>` — the removal
   * counterpart of {@link enablePlugin}. May throw when the plugin is already
   * absent from the tool's own registry; callers wrap it best-effort.
   */
  uninstallPlugin(pluginRef: string): void;
}
