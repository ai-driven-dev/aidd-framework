import type { NativePluginActivator } from "../../../src/contexts/tools/domain/ports/native-plugin-activator.js";
import { NativePluginCliError } from "../../../src/kernel/errors.js";
import type { MarketplaceScope } from "../../../src/kernel/scope.js";

/** Records native plugin CLI calls instead of shelling out. Two measured shapes: a real
 * `claude` refuses a mismatched-scope uninstall, and a plain `Error` no adapter produces. */
export class FakeNativePluginActivator implements NativePluginActivator {
  available: boolean;
  readonly addedMarketplaces: string[] = [];
  readonly removedMarketplaces: string[] = [];
  readonly forcedRemovals: boolean[] = [];
  readonly enabledPlugins: string[] = [];
  readonly uninstalledPlugins: string[] = [];
  /** The scope each call actually carried, in call order, never guessed from the ref. */
  readonly enabledPluginScopes: MarketplaceScope[] = [];
  readonly uninstalledPluginScopes: MarketplaceScope[] = [];
  upgradeCount = 0;
  private readonly failOnPlugins: ReadonlySet<string>;
  private readonly conflictOnAdd: boolean;
  private readonly throwOnRemove: boolean;
  private readonly pluginsEnabledHere: boolean;
  private readonly state: "live" | "dead" | "unknown";
  private readonly failOnUninstall: ReadonlySet<string>;
  private readonly crashOnAddMarketplace: boolean;
  private readonly crashOnUninstall: boolean;
  private readonly installedAtScope: ReadonlyMap<string, MarketplaceScope>;

  constructor(
    options: {
      available?: boolean;
      failOnPlugins?: readonly string[];
      conflictOnAdd?: boolean;
      throwOnRemove?: boolean;
      /** False for a tool whose plugins are enabled by a file this CLI writes. */
      enablesPlugins?: boolean;
      /** What the tool answers about a name already registered. */
      registrationState?: "live" | "dead" | "unknown";
      failOnUninstall?: readonly string[];
      crashOnAddMarketplace?: boolean;
      crashOnUninstall?: boolean;
      installedAtScope?: ReadonlyMap<string, MarketplaceScope>;
    } = {}
  ) {
    this.available = options.available ?? false;
    this.failOnPlugins = new Set(options.failOnPlugins ?? []);
    this.conflictOnAdd = options.conflictOnAdd ?? false;
    this.throwOnRemove = options.throwOnRemove ?? false;
    this.pluginsEnabledHere = options.enablesPlugins ?? true;
    this.state = options.registrationState ?? "unknown";
    this.failOnUninstall = new Set(options.failOnUninstall ?? []);
    this.crashOnAddMarketplace = options.crashOnAddMarketplace ?? false;
    this.crashOnUninstall = options.crashOnUninstall ?? false;
    this.installedAtScope = options.installedAtScope ?? new Map();
  }

  registrationState(): "live" | "dead" | "unknown" {
    return this.state;
  }

  enablesPlugins(): boolean {
    return this.pluginsEnabledHere;
  }

  isAvailable(): boolean {
    return this.available;
  }

  addMarketplace(source: string, _scope?: unknown): void {
    if (this.crashOnAddMarketplace) {
      throw new Error("activator crashed adding a marketplace");
    }
    if (this.conflictOnAdd && this.removedMarketplaces.length === 0) {
      throw new NativePluginCliError(
        "marketplace is already added from a different source; remove it before adding this source"
      );
    }
    this.addedMarketplaces.push(source);
  }

  removeMarketplace(name: string, _scope?: unknown, options?: { force?: boolean }): void {
    this.forcedRemovals.push(options?.force === true);
    if (this.throwOnRemove) {
      throw new NativePluginCliError(
        `marketplace remove ${name} failed: '${name}' is not configured or installed`
      );
    }
    this.removedMarketplaces.push(name);
  }

  upgradeMarketplaces(): void {
    this.upgradeCount += 1;
  }

  enablePlugin(pluginRef: string, scope: MarketplaceScope = "project"): void {
    this.enabledPluginScopes.push(scope);
    if (this.failOnPlugins.has(pluginRef)) {
      throw new NativePluginCliError(`plugin \`${pluginRef}\` was not found in marketplace`);
    }
    this.enabledPlugins.push(pluginRef);
  }

  uninstallPlugin(pluginRef: string, scope: MarketplaceScope = "project"): void {
    if (this.crashOnUninstall) {
      throw new Error("activator crashed uninstalling a plugin");
    }
    this.uninstalledPluginScopes.push(scope);
    if (this.failOnUninstall.has(pluginRef)) {
      throw new NativePluginCliError(`plugin \`${pluginRef}\` is not installed`);
    }
    const installedScope = this.installedAtScope.get(pluginRef);
    if (installedScope !== undefined && installedScope !== scope) {
      throw new NativePluginCliError(
        `plugin \`${pluginRef}\` is not installed at scope '${scope}'`
      );
    }
    this.uninstalledPlugins.push(pluginRef);
  }
}
