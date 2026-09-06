import { nativeActivationOf } from "../../contexts/tools/domain/registry.js";
import type { AiToolId } from "../../kernel/tool.js";
import type { CLIOutput } from "../output.js";

export function printUnrestorable(output: CLIOutput, unrestorable: readonly string[]): void {
  if (unrestorable.length === 0) return;
  output.warn(
    `Could not restore ${unrestorable.length} file(s) no longer part of the current distribution: ${unrestorable.join(", ")}`
  );
}

/** Names every AI tool `sync` could not restore a plugin file for because its own CLI
 * owns the registration — a fact, not a failure, so it warns rather than errors. */
export function printNativeOnlyTools(output: CLIOutput, toolIds: readonly AiToolId[]): void {
  for (const toolId of toolIds) {
    const binary = nativeActivationOf(toolId)?.binary ?? toolId;
    output.warn(
      `${toolId}: plugins are registered by the ${binary} CLI, not by this file tree; run \`aidd framework install --tool ${toolId}\` to register them.`
    );
  }
}
