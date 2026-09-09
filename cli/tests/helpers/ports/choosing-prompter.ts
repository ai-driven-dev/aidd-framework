import type { Prompter } from "../../../src/kernel/ports/prompter.js";

export class ChoosingPrompter implements Prompter {
  readonly selectCalls: Array<{ message: string; choiceNames: string[] }> = [];

  constructor(private readonly chosenName: string) {}

  async resolveConflict(
    _relativePath: string,
    _reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite"> {
    return "overwrite";
  }

  async resolveConflictBulk(
    _relativePath: string,
    _reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite" | "overwrite-all" | "skip-all"> {
    return "overwrite";
  }

  async confirm(_message: string, defaultValue?: boolean): Promise<boolean> {
    return defaultValue ?? true;
  }

  async input(_message: string, defaultValue?: string): Promise<string> {
    return defaultValue ?? "";
  }

  async select<T>(
    message: string,
    choices: Array<{ name: string; value: T; disabled?: boolean | string; description?: string }>
  ): Promise<T> {
    this.selectCalls.push({ message, choiceNames: choices.map((c) => c.name) });
    const match = choices.find((c) => c.name === this.chosenName);
    if (match === undefined) {
      throw new Error(`ChoosingPrompter: no choice named "${this.chosenName}" for "${message}"`);
    }
    return match.value;
  }

  async checkbox<T>(
    _message: string,
    _choices: Array<{ name: string; value: T; checked?: boolean; disabled?: boolean | string }>
  ): Promise<T[]> {
    return [];
  }
}
