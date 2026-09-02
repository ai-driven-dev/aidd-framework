import type { Command } from "commander";
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
