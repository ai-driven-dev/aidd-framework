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

/**
 * Validates a raw `--scope` flag, shared by `setup`, `doctor` and `sync` — the three
 * commands `--scope user` reaches. Returns the value as given (including `undefined`
 * for an absent flag); each caller applies its own default (`SetupFlow` defaults to
 * `"project"` internally, `doctor`/`sync` default at the call site), rather than this
 * function guessing one default for callers that may one day want a different one.
 */
export function parseScopeFlag(
  raw: string | undefined,
  output: CLIOutput
): MarketplaceScope | undefined {
  if (raw === undefined || raw === "project" || raw === "user") return raw;
  output.error(`Invalid --scope "${raw}" — expected "project" or "user".`);
  process.exit(1);
}
