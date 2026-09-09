import { SyncFailedError } from "../../kernel/errors.js";
import type { createDeps } from "../../runtime/wiring/framework.js";
import type { CLIOutput } from "../output.js";

/** Named structurally rather than imported: `marketplace-sync-settings-use-case.ts` is
 * internal to `framework`, and every real caller's result already satisfies this shape. */
interface SyncActivationOutcome {
  readonly errors: readonly { scope: string; message: string }[];
}

/** Drives native activation and surfaces what it did: a result thrown away turns a refusal
 * into exit 0 with nothing printed and a plugin that never loads. Every command driving
 * activation reads it here, never a second way. */
export async function syncNativeActivation(
  deps: Awaited<ReturnType<typeof createDeps>>,
  output: CLIOutput,
  projectRoot: string,
  /** Narrows activation to these marketplaces alone; omitted, every registered one is
   * re-driven. */
  marketplaceNames?: readonly string[]
): Promise<void> {
  const activation = await deps.marketplaceSyncSettingsUseCase.execute({
    projectRoot,
    marketplaceNames,
  });
  reportSyncActivation(output, activation);
}

/** The print-and-throw half of {@link syncNativeActivation}, for a caller whose own use case
 * already ran `execute`: calling it a second time here would run every tool's own CLI twice
 * for one command. */
export function reportSyncActivation(output: CLIOutput, activation: SyncActivationOutcome): void {
  for (const e of activation.errors) output.warn(`[${e.scope}] ${e.message}`);
  if (activation.errors.length > 0) throw new SyncFailedError(activation.errors);
}
