import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { NativePluginCliError } from "../../../kernel/errors.js";
import type { MarketplaceScope } from "../../../kernel/scope.js";
import type { NativePluginActivator } from "../domain/ports/native-plugin-activator.js";

// `plugin add/install` may fetch and cache a marketplace snapshot from a git remote.
const COMMAND_TIMEOUT_MS = 120000;

/**
 * Shared shell-out machinery for a tool's plugin CLI. Subclasses declare the
 * binary and the tool-specific verbs (enable / upgrade) that differ between CLIs.
 */
export abstract class AbstractNativePluginCliAdapter implements NativePluginActivator {
  protected abstract readonly binary: string;

  /**
   * Resolves the binary on PATH (filesystem check, no process spawn). Spawning a
   * `--version` probe just to test presence is flake-prone under load (transient
   * spawn failures); a PATH lookup is what "callable on PATH" actually means.
   */
  isAvailable(): boolean {
    const dirs = (process.env.PATH ?? "").split(delimiter).filter((dir) => dir !== "");
    return dirs.some((dir) => {
      try {
        accessSync(join(dir, this.binary), constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
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
  abstract enablePlugin(pluginRef: string): void;

  /** Runs a command purely for its exit code; never throws. */
  protected succeeds(args: readonly string[]): boolean {
    const result = spawnSync(this.binary, [...args], {
      timeout: COMMAND_TIMEOUT_MS,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return result.error === undefined && result.status === 0;
  }

  protected run(args: readonly string[], label: string): void {
    const result = spawnSync(this.binary, [...args], {
      timeout: COMMAND_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    });
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
