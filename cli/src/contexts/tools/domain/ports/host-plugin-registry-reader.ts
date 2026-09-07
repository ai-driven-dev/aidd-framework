import type { MarketplaceScope } from "../../../../kernel/scope.js";

/**
 * What a host's own plugin registry says, read from the file that host maintains itself.
 *
 * A host loads a plugin only once it appears in its own user-global registry, whatever the
 * project's settings declare. That is the asymmetry #703 is about: `aidd` writes a
 * declaration, the host keeps a registry, and only the second one decides. Measured
 * 2026-09-02 across the three hosts that declare a native activation — Claude Code, Codex
 * and Copilot — all three key that registry on the same `<plugin>@<marketplace>` string
 * `enabledPlugins` uses, so a reading is a set of refs whatever file it came out of.
 *
 * One implementation per host, because only the file and its parse differ; the shape below
 * is the same for all of them, and a host with no implementation is simply not in the map
 * the diagnostic consults — never assumed to agree.
 */
/** What a registry says about one ref: whether the host records it enabled, and — for a
 * host whose registry carries a per-entry scope (Claude) — the scope of the entry that
 * answers for the project asked about. `undefined` for a host whose registry has no
 * scope concept at all (Codex, Copilot): both are machine-global, so there is nothing
 * to report. Read by `uninstallPlugin`'s callers before they undo a registration, since
 * a real `claude` binary refuses a mismatched-scope uninstall outright — see
 * `native-plugin-activator.ts`. */
export interface HostPluginRegistryEntry {
  readonly enabled: boolean;
  readonly scope?: MarketplaceScope;
}

export interface HostPluginRegistryReading {
  /** The file consulted, named whatever it answered, so a person can open the same one. */
  readonly location: string;
  /**
   * Every ref the registry carries, mapped to what it says about it.
   *
   * **Absent, never empty, when the registry could not be read.** An empty map is a real
   * answer — the file opened and carries no plugin — and it must not be reachable from a
   * file that never opened at all. Keeping the two apart in the type is what stops a
   * caller inventing "not registered" out of a permissions error.
   */
  readonly refs?: ReadonlyMap<string, HostPluginRegistryEntry>;
  /** Why the registry could not be read, when it could not: absent, unreadable, or holding
   * something this reader will not pretend to understand. Present exactly when `refs` is
   * absent. */
  readonly unreadable?: string;
}

export interface HostPluginRegistryReader {
  /** `projectRoot` because a registry may bind a ref to one project rather than to the
   * machine — Claude's does, on 100 of the 115 entries measured. A reader whose host records
   * no such binding ignores it and says so in its own doc, rather than silently answering a
   * narrower question than it was asked. */
  read(projectRoot: string): Promise<HostPluginRegistryReading>;
}
