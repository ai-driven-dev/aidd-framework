import type { MarketplaceScope } from "../../../../kernel/scope.js";

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
  addMarketplace(source: string, scope: MarketplaceScope): void;
  /** True when this tool enables plugins through its CLI rather than through a file. */
  enablesPlugins(): boolean;
  /** Unregisters a marketplace by name, in the scope it was added to. May throw when absent. */
  removeMarketplace(name: string, scope: MarketplaceScope, options?: { force?: boolean }): void;
  /**
   * Whether the registration under this name still resolves to something.
   * `"unknown"` where the tool offers no way to tell, which callers must read as
   * "leave it alone": a registration that might belong to a live project elsewhere is
   * not one to take over.
   */
  registrationState(name: string): "live" | "dead" | "unknown";
  /** Refreshes marketplace snapshots so plugin installs pick up new versions. No-op when unsupported. */
  upgradeMarketplaces(): void;
  /**
   * Installs and enables a plugin referenced as `<plugin>@<marketplace>`. Idempotent.
   *
   * `scope` carries the same `MarketplaceScope` `addMarketplace`/`removeMarketplace`
   * already take, but answers a different question: not where the marketplace
   * registration itself lives (always `"user"` for the shared framework source), but
   * at what scope *this* plugin gets enabled — `"project"` by default, mapping to
   * claude's own `--scope local` so the enablement stays bound to this project, never
   * silently landing at claude's own implicit `"user"` default the way an omitted
   * `--scope` measurably does — before this parameter existed, `enablePlugin` passed
   * no scope argument at all, so a real `claude` binary always chose its own default,
   * `"user"`, machine-wide, regardless of which scope `aidd` itself ran at. A tool
   * whose profile declares no `scopeArgs` (codex, copilot) ignores this entirely.
   */
  enablePlugin(pluginRef: string, scope?: MarketplaceScope): void;
  /**
   * Uninstalls a plugin referenced as `<plugin>@<marketplace>` — the removal
   * counterpart of {@link enablePlugin}. May throw when the plugin is already
   * absent from the tool's own registry; callers wrap it best-effort. `scope` must
   * match the scope the plugin was enabled at — a real `claude` binary refuses a
   * mismatched-scope uninstall outright (measured), rather than silently missing it.
   */
  uninstallPlugin(pluginRef: string, scope?: MarketplaceScope): void;
}
