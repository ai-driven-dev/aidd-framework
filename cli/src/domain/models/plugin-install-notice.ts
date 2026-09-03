import type { AiToolId } from "./tool-ids.js";

/**
 * A component was delivered, not skipped, but only runs once a precondition outside the
 * install is met — distinct from {@link import("./plugin-translation-skip.js").PluginTranslationSkip},
 * which names a component that was never delivered at all.
 */
export interface PluginInstallNotice {
  readonly pluginName: string;
  readonly component: "hooks";
  readonly toolId: AiToolId;
  readonly message: string;
}

export type ReadonlyNoticeList = readonly PluginInstallNotice[];
