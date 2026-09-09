/**
 * What a host's own marketplace registry says, read from the file that host maintains itself.
 *
 * Distinct from {@link HostPluginRegistryReading}, which answers whether a plugin ref loads:
 * this answers whether a marketplace *name* is already held, and by which resolved source.
 * Measured against the real `claude` binary, `claude plugin marketplace add <dir>` derives the
 * registered name from the source's own `marketplace.json`, never from an argument, and
 * re-adding that name from a different directory silently overwrites `installLocation` — no
 * prompt, no error, exit 0. One implementation exists, Claude Code's, because Codex refuses a
 * re-add from a different source itself and Copilot refuses every re-add.
 */
export interface HostMarketplaceRegistryReading {
  /** The file consulted, named whatever it answered, so a person can open the same one. */
  readonly location: string;
  /**
   * Every marketplace name the registry carries, mapped to the resolved (`realpath`'d) source
   * it currently points at. **Absent, never empty, when the registry could not be read**: an
   * empty map is a real answer — the file opened and holds no marketplace — and must not be
   * reachable from a file that never opened at all.
   */
  readonly entries?: ReadonlyMap<string, string>;
  /**
   * `true` when the registry file itself does not exist — nothing has ever named a marketplace
   * there, so a consumer proving a cache safe to purge may treat this as an empty registry. A
   * file that exists but could not be parsed proves nothing. Never set with `unreadable`.
   */
  readonly absent?: true;
  /** Why the registry could not be read, when it exists but reading or parsing it failed.
   * Present exactly when `entries` and `absent` are both absent. */
  readonly unreadable?: string;
}

export interface HostMarketplaceRegistryReader {
  read(): Promise<HostMarketplaceRegistryReading>;
}
