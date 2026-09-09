import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { NativePluginCliError } from "../../../kernel/errors.js";
import type { MarketplaceScope } from "../../../kernel/scope.js";
import type { NativePluginActivator } from "../domain/ports/native-plugin-activator.js";
import {
  hostExecutableLookup,
  resolveExecutableOnPath,
  runsThroughShell,
  windowsCommandLine,
} from "./executable-on-path.js";

// `plugin add/install` may fetch and cache a marketplace snapshot from a git remote.
const COMMAND_TIMEOUT_MS = 120000;

/** Shared shell-out machinery for a tool's plugin CLI. Subclasses declare the binary and the
 * tool-specific verbs that differ between CLIs. */
export abstract class AbstractNativePluginCliAdapter implements NativePluginActivator {
  protected abstract readonly binary: string;

  /** Resolves the binary on PATH by filesystem check, with no process spawn: a `--version`
   * probe just to test presence is flake-prone under load. */
  isAvailable(): boolean {
    return resolveExecutableOnPath(this.binary, hostExecutableLookup()) !== undefined;
  }

  /** The binary as the OS will run it. A `.cmd`/`.bat` shim — what npm installs on Windows —
   * cannot be spawned directly, so it goes through the command interpreter with its arguments
   * quoted; anything else is spawned by its bare name. */
  private spawn(
    args: readonly string[],
    stdio: ["ignore", "ignore" | "pipe", "ignore" | "pipe"]
  ): SpawnSyncReturns<string> {
    const options = { timeout: COMMAND_TIMEOUT_MS, stdio, encoding: "utf-8" as const };
    const executable = resolveExecutableOnPath(this.binary, hostExecutableLookup());
    if (executable !== undefined && runsThroughShell(executable)) {
      return spawnSync(windowsCommandLine(executable, args), { ...options, shell: true });
    }
    return spawnSync(this.binary, [...args], options);
  }

  /** Scope arguments the profile declares, empty for a tool whose registry is global. */
  protected abstract scopeArgsFor(scope: MarketplaceScope): readonly string[];
  /** Arguments that force a removal past installed plugins, empty when unsupported. */
  protected abstract forceRemoveArgs(): readonly string[];

  addMarketplace(source: string, scope: MarketplaceScope): void {
    this.run(
      ["plugin", "marketplace", "add", source, ...this.scopeArgsFor(scope)],
      `marketplace add ${source}`
    );
  }

  removeMarketplace(name: string, scope: MarketplaceScope, options?: { force?: boolean }): void {
    const force = options?.force === true ? this.forceRemoveArgs() : [];
    this.run(
      ["plugin", "marketplace", "remove", name, ...this.scopeArgsFor(scope), ...force],
      `marketplace remove ${name}`
    );
  }

  abstract enablesPlugins(): boolean;
  abstract registrationState(name: string): "live" | "dead" | "unknown";
  abstract upgradeMarketplaces(): void;
  abstract enablePlugin(pluginRef: string, scope?: MarketplaceScope): void;
  abstract uninstallPlugin(pluginRef: string, scope?: MarketplaceScope): void;

  /** Runs a command purely for its exit code; never throws. */
  protected succeeds(args: readonly string[]): boolean {
    const result = this.spawn(args, ["ignore", "ignore", "ignore"]);
    return result.error === undefined && result.status === 0;
  }

  protected run(args: readonly string[], label: string): void {
    const result = this.spawn(args, ["ignore", "pipe", "pipe"]);
    if (result.error) {
      throw new NativePluginCliError(`${this.binary} ${label} failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
      const detail = result.stderr?.trim() ?? "";
      throw new NativePluginCliError(
        `${this.binary} ${label} failed: ${detail || `exited with code ${result.status ?? "unknown"}`}`
      );
    }
  }
}
