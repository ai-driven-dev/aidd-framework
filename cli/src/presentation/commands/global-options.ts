import type { Command } from "commander";
import type { MarketplaceScope } from "../../kernel/scope.js";
import { CLIOutput } from "../output.js";

export interface GlobalOptions {
  verbose: boolean;
  output: CLIOutput;
  projectRoot: string;
}

export function parseGlobalOptions(program: Command): GlobalOptions {
  const opts = program.opts<{ verbose?: boolean }>();
  const verbose = opts.verbose ?? false;
  return {
    verbose,
    output: new CLIOutput(verbose),
    projectRoot: process.cwd(),
  };
}

/** Returns the flag as given, `undefined` included: each caller applies its own default
 * rather than this validation guessing one for all of them. */
export function parseScopeFlag(
  raw: string | undefined,
  output: CLIOutput
): MarketplaceScope | undefined {
  if (raw === undefined || raw === "project" || raw === "user") return raw;
  output.error(`Invalid --scope "${raw}" — expected "project" or "user".`);
  process.exit(1);
}
