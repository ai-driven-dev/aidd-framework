import type { NativePluginActivator } from "../../../src/contexts/tools/domain/ports/native-plugin-activator.js";
import { NativePluginCliError } from "../../../src/kernel/errors.js";

/**
 * Records native plugin CLI activation calls instead of shelling out.
 * Defaults to unavailable so unit deps skip activation unless a test opts in.
 * `failOnPlugins` makes `enablePlugin` throw for the listed refs (simulates a
 * plugin missing from the marketplace snapshot).
 * `conflictOnAdd` makes `addMarketplace` throw until `removeMarketplace` is called
 * once (simulates the CLI rejecting `add` when the name exists from a different source).
 * `throwOnRemove` makes `removeMarketplace` throw (simulates removing an absent name,
 * i.e. an `add` that failed for a reason other than a different-source conflict).
 * `failOnUninstall` makes `uninstallPlugin` throw for the listed refs (simulates the
 * plugin already being absent from the tool's own registry).
 */
export class FakeNativePluginActivator implements NativePluginActivator {
  available: boolean;
  readonly addedMarketplaces: string[] = [];
  readonly removedMarketplaces: string[] = [];
  readonly forcedRemovals: boolean[] = [];
  readonly enabledPlugins: string[] = [];
  readonly uninstalledPlugins: string[] = [];
  upgradeCount = 0;
  private readonly failOnPlugins: ReadonlySet<string>;
  private readonly conflictOnAdd: boolean;
  private readonly throwOnRemove: boolean;
  private readonly pluginsEnabledHere: boolean;
  private readonly state: "live" | "dead" | "unknown";
  private readonly failOnUninstall: ReadonlySet<string>;

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
    } = {}
  ) {
    this.available = options.available ?? false;
    this.failOnPlugins = new Set(options.failOnPlugins ?? []);
    this.conflictOnAdd = options.conflictOnAdd ?? false;
    this.throwOnRemove = options.throwOnRemove ?? false;
    this.pluginsEnabledHere = options.enablesPlugins ?? true;
    this.state = options.registrationState ?? "unknown";
    this.failOnUninstall = new Set(options.failOnUninstall ?? []);
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

  enablePlugin(pluginRef: string): void {
    if (this.failOnPlugins.has(pluginRef)) {
      throw new NativePluginCliError(`plugin \`${pluginRef}\` was not found in marketplace`);
    }
    this.enabledPlugins.push(pluginRef);
  }

  uninstallPlugin(pluginRef: string): void {
    if (this.failOnUninstall.has(pluginRef)) {
      throw new NativePluginCliError(`plugin \`${pluginRef}\` is not installed`);
    }
    this.uninstalledPlugins.push(pluginRef);
  }
}
