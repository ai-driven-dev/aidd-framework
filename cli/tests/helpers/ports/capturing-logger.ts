import type { Logger } from "../../../src/kernel/ports/logger.js";

/**
 * In-memory Logger implementation that captures messages to arrays.
 * Useful for asserting on log output in unit tests.
 */
export class CapturingLogger implements Logger {
  readonly debugMessages: string[] = [];
  readonly infoMessages: string[] = [];
  readonly warnMessages: string[] = [];

  debug(message: string): void {
    this.debugMessages.push(message);
  }

  info(message: string): void {
    this.infoMessages.push(message);
  }

  warn(message: string): void {
    this.warnMessages.push(message);
  }

  /** All messages across all levels, in order of emission. */
  get allMessages(): string[] {
    return [...this.debugMessages, ...this.infoMessages, ...this.warnMessages];
  }

  reset(): void {
    this.debugMessages.length = 0;
    this.infoMessages.length = 0;
    this.warnMessages.length = 0;
  }
}
