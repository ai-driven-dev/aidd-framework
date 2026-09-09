import type { ToolId } from "../../kernel/tool.js";
import type { CLIOutput } from "../output.js";
import { printNativeActivation, printUnrestorable } from "./restore-display.js";

interface ScopedError {
  readonly scope: string;
  readonly message: string;
}

interface RestoreAllResult {
  readonly errors: readonly ScopedError[];
  readonly totalRestored: number;
  readonly totalKept: number;
  readonly pluginNamesRestored: readonly string[];
  readonly unrestorable: readonly string[];
}

interface ToolRestoreResult {
  readonly tools: readonly { readonly nothingToRestore: boolean }[];
  readonly totalRestored: number;
  readonly totalKept: number;
  readonly unrestorable: readonly string[];
}

interface ActivationOutcome {
  readonly binaryMissing: readonly { readonly toolId: ToolId; readonly binary: string }[];
  readonly errors: readonly ScopedError[];
}

export function printRestoreOutcome(output: CLIOutput, result: RestoreAllResult): void {
  for (const e of result.errors) output.warn(`[${e.scope}] ${e.message}`);

  const nothingToRestore =
    result.errors.length === 0 &&
    result.totalRestored === 0 &&
    result.pluginNamesRestored.length === 0 &&
    result.unrestorable.length === 0;
  if (nothingToRestore) {
    output.success("Nothing to restore — all files are unmodified.");
    return;
  }
  if (result.totalRestored > 0) {
    output.success(`Restored ${result.totalRestored} file(s), kept ${result.totalKept} file(s)`);
  }
  if (result.pluginNamesRestored.length > 0) {
    output.success(`Restored plugins: ${result.pluginNamesRestored.join(", ")}`);
  }
  printUnrestorable(output, result.unrestorable);
}

export function printToolRestoreOutcome(output: CLIOutput, result: ToolRestoreResult): void {
  const nothingDone = result.tools.every((t) => t.nothingToRestore);
  if (nothingDone) {
    output.success("Nothing to restore — all files are unmodified.");
    return;
  }
  output.success(
    `Restored ${result.totalRestored} ${result.totalRestored === 1 ? "file" : "files"}, kept ${result.totalKept} ${result.totalKept === 1 ? "file" : "files"}`
  );
  printUnrestorable(output, result.unrestorable);
}

/** Every line native activation produced, in the order a host's own CLI produced them: a
 * missing binary first, then whatever the run refused. The refusal itself stays the caller's. */
export function printActivationOutcome(output: CLIOutput, activation: ActivationOutcome): void {
  printNativeActivation(output, activation.binaryMissing);
  for (const e of activation.errors) output.warn(`[${e.scope}] ${e.message}`);
}

export function printUserScopeSyncOutcome(output: CLIOutput, activated: readonly string[]): void {
  if (activated.length === 0) {
    output.success("Nothing to sync — no tool is registered at user scope yet.");
  } else {
    output.success(`Synced native activation for: ${activated.join(", ")}`);
  }
}
