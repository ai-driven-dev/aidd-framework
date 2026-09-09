import type { Prompter } from "../../../src/kernel/ports/prompter.js";

export class RecordingPrompter implements Prompter {
  readonly confirmMessages: string[] = [];

  constructor(private readonly answer: boolean) {}

  get lastConfirmMessage(): string | undefined {
    return this.confirmMessages.at(-1);
  }

  async confirm(message: string): Promise<boolean> {
    this.confirmMessages.push(message);
    return this.answer;
  }
  async resolveConflict(): Promise<"keep" | "overwrite"> {
    return "keep";
  }
  async resolveConflictBulk(): Promise<"keep" | "overwrite" | "overwrite-all" | "skip-all"> {
    return "keep";
  }
  async input(): Promise<string> {
    return "";
  }
  async select<T>(): Promise<T> {
    throw new Error("not implemented");
  }
  async checkbox<T>(): Promise<T[]> {
    return [];
  }
}
