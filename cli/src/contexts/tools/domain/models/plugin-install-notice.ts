import type { AiToolId } from "../../../../kernel/tool.js";

/** A component was delivered, not skipped, but runs only once a precondition outside the install
 * is met — unlike `PluginTranslationSkip`, which names a component never delivered at all. */
export interface PluginInstallNotice {
  readonly pluginName: string;
  readonly component: "hooks";
  readonly toolId: AiToolId;
  readonly message: string;
}

export type ReadonlyNoticeList = readonly PluginInstallNotice[];
