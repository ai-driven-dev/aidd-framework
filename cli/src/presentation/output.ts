import type { Logger } from "../kernel/ports/logger.js";

export class CLIOutput implements Logger {
  readonly verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose || process.env.AIDD_VERBOSE === "true";
  }

  debug(message: string): void {
    if (this.verbose) process.stderr.write(`[verbose] ${message}\n`);
  }

  info(message: string): void {
    process.stdout.write(`${message}\n`);
  }

  warn(message: string): void {
    process.stderr.write(`Warning: ${message}\n`);
  }

  print(message: string): void {
    process.stdout.write(`${message}\n`);
  }

  success(message: string): void {
    process.stdout.write(`${message}\n`);
  }

  error(message: string): void {
    process.stderr.write(`Error: ${message}\n`);
  }
}
