import type { AiToolId } from "../../../../kernel/tool.js";

/** One plugin, as measurement needs it: a name to report and the marketplace it came from,
 * which is what a host's own registry is keyed by. Nothing else about a plugin is a fact
 * `telemetry check` states, so nothing else crosses. */
export interface InstalledPluginRef {
  readonly name: string;
  readonly marketplace: string | undefined;
}

/**
 * What this project recorded as installed, per tool.
 *
 * Telemetry asks one question of the installation record — "which plugins should this host
 * be loading?" — and that question is narrower than the record itself. Declared here, as a
 * port telemetry owns, so measurement never reaches into the context that keeps the record:
 * the composition root satisfies it from whatever holds one.
 */
export interface InstalledPluginsReader {
  /** The file the record lives in, so an unreadable one can be reported by name. */
  readonly path: string;

  /**
   * Every plugin recorded, keyed by the tool it was installed for. `null` when this project
   * has no record at all — which is not an error, only a project nothing was installed into.
   *
   * Throws when a record exists and cannot be read: `telemetry check` is the command a person
   * runs when something is wrong, so a damaged file must say so rather than read as empty.
   */
  read(): Promise<ReadonlyMap<AiToolId, readonly InstalledPluginRef[]> | null>;
}
