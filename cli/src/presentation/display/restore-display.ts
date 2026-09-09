import type { ToolId } from "../../kernel/tool.js";
import type { CLIOutput } from "../output.js";

export function printUnrestorable(output: CLIOutput, unrestorable: readonly string[]): void {
  if (unrestorable.length === 0) return;
  output.warn(
    `Could not restore ${unrestorable.length} file(s) no longer part of the current distribution: ${unrestorable.join(", ")}`
  );
}

/** A binary off PATH is a fact, not a failure, so this warns: the settings written for that
 * tool will not load until its own CLI has run. */
export function printNativeActivation(
  output: CLIOutput,
  binaryMissing: readonly { toolId: ToolId; binary: string }[]
): void {
  for (const { toolId, binary } of binaryMissing) {
    output.warn(`${toolId}: the plugin will not load until the ${binary} CLI has run.`);
  }
}
