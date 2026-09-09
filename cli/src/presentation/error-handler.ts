import type { CLIOutput } from "./output.js";

export class ErrorHandler {
  constructor(private readonly output: CLIOutput) {}

  handle(error: unknown): never {
    this.output.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
