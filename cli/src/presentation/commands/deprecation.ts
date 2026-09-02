import type { CLIOutput } from "../output.js";

/**
 * Every retiring spelling prints exactly one line naming its replacement, on stderr so
 * it never pollutes stdout — the equivalence test (phase 18) diffs stdout byte-for-byte
 * for pure renames, and a warning on stdout would fail that diff for no behavioral reason.
 */
export function warnDeprecated(output: CLIOutput, oldSpelling: string, newSpelling: string): void {
  output.warn(`\`aidd ${oldSpelling}\` is deprecated, use \`aidd ${newSpelling}\` instead.`);
}
