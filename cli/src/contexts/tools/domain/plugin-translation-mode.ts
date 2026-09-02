/**
 * Discriminant for the two plugin translation strategies.
 * - "marketplace": Mode A — register plugin reference in tool's native config (no file materialization).
 * - "flat": Mode B — materialize plugin content as files on disk.
 */
export type PluginTranslationMode = "marketplace" | "flat";
