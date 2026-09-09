import type { Logger } from "../../../src/kernel/ports/logger.js";

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

  get allMessages(): string[] {
    return [...this.debugMessages, ...this.infoMessages, ...this.warnMessages];
  }

  reset(): void {
    this.debugMessages.length = 0;
    this.infoMessages.length = 0;
    this.warnMessages.length = 0;
  }
}
