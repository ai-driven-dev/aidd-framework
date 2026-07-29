import type { CLIOutput } from "../output.js";

export function printUnrestorable(output: CLIOutput, unrestorable: readonly string[]): void {
  if (unrestorable.length === 0) return;
  output.warn(
    `Could not restore ${unrestorable.length} file(s) no longer part of the current distribution: ${unrestorable.join(", ")}`
  );
}
