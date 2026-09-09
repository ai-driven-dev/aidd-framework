import type { Prompter } from "../../../src/kernel/ports/prompter.js";

export interface CheckboxAsk {
  message: string;
  offered: string[];
}

export class CheckboxRecordingPrompter implements Prompter {
  readonly asks: CheckboxAsk[] = [];

  constructor(private readonly selection: readonly string[] = []) {}

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
    _message: string,
    choices: Array<{ name: string; value: T; disabled?: boolean | string }>
  ): Promise<T> {
    const first = choices.find((c) => !c.disabled);
    if (first === undefined) throw new Error("No enabled choices available");
    return first.value;
  }

  async checkbox<T>(
    message: string,
    choices: Array<{ name: string; value: T; checked?: boolean; disabled?: boolean | string }>
  ): Promise<T[]> {
    this.asks.push({ message, offered: choices.map((c) => String(c.value)) });
    return choices
      .filter((c) => !c.disabled && this.selection.includes(String(c.value)))
      .map((c) => c.value);
  }
}
