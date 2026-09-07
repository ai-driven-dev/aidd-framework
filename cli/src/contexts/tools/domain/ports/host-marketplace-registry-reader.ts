/**
 * What a host's own marketplace registry says, read from the file that host maintains
 * itself.
 *
 * Distinct from {@link HostPluginRegistryReading}, which answers whether a plugin ref
 * loads: this answers whether a marketplace *name* is already held, and by which
 * resolved source. Measured 2026-09-07 against the real `claude` binary in a relocated
 * `HOME`: `claude plugin marketplace add <dir>` derives the registered name from the
 * source's own `marketplace.json`, never from an argument, and re-adding the same name
 * from a different directory silently overwrites `installLocation` — no prompt, no
 * error, exit 0. A conflict guard needs exactly this fact: the name, and what it
 * currently resolves to, before this CLI's own activator drives that same command.
 *
 * One implementation exists today — Claude Code's `known_marketplaces.json` — because
 * Codex refuses a re-add from a different source itself (measured, `plugin marketplace
 * add` exits 1) and Copilot refuses every re-add, same source included. A tool with no
 * implementation here is simply not in the map the guard consults, never assumed to
 * agree.
 */
export interface HostMarketplaceRegistryReading {
  /** The file consulted, named whatever it answered, so a person can open the same one. */
  readonly location: string;
  /**
   * Every marketplace name the registry carries, mapped to the resolved (`realpath`'d)
   * source it currently points at.
   *
   * **Absent, never empty, when the registry could not be read.** An empty map is a
   * real answer — the file opened and holds no marketplace — and it must not be
   * reachable from a file that never opened at all, the same distinction
   * `HostPluginRegistryReading.refs` draws for the same reason.
   */
  readonly entries?: ReadonlyMap<string, string>;
  /**
   * `true` when the registry file itself does not exist — nothing has ever named a
   * marketplace there, so a consumer proving a cache safe to purge may treat this the
   * same as an empty registry. Distinct from `unreadable`: a file that exists but
   * could not be opened or parsed proves nothing, while one that never existed proves
   * the opposite of something being held. Never set together with `unreadable`.
   */
  readonly absent?: true;
  /** Why the registry could not be read, when it exists but reading or parsing it
   * failed — permission denied, malformed content, or a shape this reader will not
   * pretend to understand. Present exactly when `entries` and `absent` are both
   * absent. */
  readonly unreadable?: string;
}

export interface HostMarketplaceRegistryReader {
  read(): Promise<HostMarketplaceRegistryReading>;
}
