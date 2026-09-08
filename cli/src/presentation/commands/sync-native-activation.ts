import { SyncFailedError } from "../../kernel/errors.js";
import type { createDeps } from "../../runtime/wiring/framework.js";
import type { CLIOutput } from "../output.js";

/** The one piece of `MarketplaceSyncSettingsResult` this module reads — named here,
 * structurally, rather than imported: `marketplace-sync-settings-use-case.ts` is
 * internal to the `framework` context (`context-boundary.arch.test.ts`'s
 * `PUBLIC_MODULES`), and every real caller already holds a `MarketplaceSyncSettingsResult`,
 * which satisfies this shape without presentation reaching into that context's interior. */
interface SyncActivationOutcome {
  readonly errors: readonly { scope: string; message: string }[];
}

/**
 * Drives native activation after a command changed something, and surfaces what it
 * did — every call site here used to throw the result away, so a refusal like the
 * marketplace source-conflict guard (`MarketplaceSyncSettingsUseCase.registerMarketplace`)
 * never reached the person running the command: exit 0, nothing printed, and a
 * marketplace or plugin that silently never loaded. `sync.ts` held this shape first;
 * `plugin install | remove | update` and `marketplace add | remove | refresh` all need
 * the same one, not a second way of reading the same result.
 */
export async function syncNativeActivation(
  deps: Awaited<ReturnType<typeof createDeps>>,
  output: CLIOutput,
  projectRoot: string,
  /** Narrows activation to these marketplaces alone — `marketplace add` passes the
   * name it just registered; `plugin install --from <market>` passes that flag's own
   * value. Every other caller omits this and re-drives every registered marketplace,
   * unchanged. */
  marketplaceNames?: readonly string[]
): Promise<void> {
  const activation = await deps.marketplaceSyncSettingsUseCase.execute({
    projectRoot,
    marketplaceNames,
  });
  reportSyncActivation(output, activation);
}

/**
 * The print-and-throw half of {@link syncNativeActivation}, split out for a caller
 * whose own use case already ran `MarketplaceSyncSettingsUseCase.execute` itself —
 * `setup` and `framework install`'s plugin-propagation step both drive activation as
 * one step of a larger flow, and calling `execute` a second time here would run every
 * tool's own CLI twice for one command. What both still owed this result, same as
 * every other caller, is surfacing it: a refusal used to come back as `errors` and
 * reach nobody, exit 0, nothing printed, marketplace or plugin never loaded.
 */
export function reportSyncActivation(output: CLIOutput, activation: SyncActivationOutcome): void {
  for (const e of activation.errors) output.warn(`[${e.scope}] ${e.message}`);
  if (activation.errors.length > 0) throw new SyncFailedError(activation.errors);
}
