import type { Prompter } from "../../../src/kernel/ports/prompter.js";

type PromptAnswer =
  | { type: "conflict"; value: "keep" | "overwrite" }
  | { type: "conflict-bulk"; value: "keep" | "overwrite" | "overwrite-all" | "skip-all" }
  | { type: "confirm"; value: boolean }
  | { type: "input"; value: string }
  | { type: "select"; value: string }
  | { type: "checkbox"; value: string[] };

/**
 * Scripted prompter that returns pre-defined answers in order.
 * Throws on unexpected prompt calls (queue exhausted).
 */
export class ScriptedPrompter implements Prompter {
  private readonly queue: PromptAnswer[];
  private index = 0;

  constructor(answers: PromptAnswer[]) {
    this.queue = [...answers];
  }

  async resolveConflict(
    relativePath: string,
    _reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite"> {
    const answer = this.next("conflict", relativePath);
    return answer.value as "keep" | "overwrite";
  }

  async resolveConflictBulk(
    relativePath: string,
    _reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite" | "overwrite-all" | "skip-all"> {
    const answer = this.next("conflict-bulk", relativePath);
    return answer.value as "keep" | "overwrite" | "overwrite-all" | "skip-all";
  }

  async confirm(message: string, defaultValue?: boolean): Promise<boolean> {
    if (this.index >= this.queue.length) {
      return defaultValue ?? false;
    }
    const answer = this.next("confirm", message);
    return answer.value as boolean;
  }

  async input(message: string, defaultValue?: string): Promise<string> {
    if (this.index >= this.queue.length) {
      return defaultValue ?? "";
    }
    const answer = this.next("input", message);
    return answer.value as string;
  }

  async select<T>(
    message: string,
    choices: Array<{ name: string; value: T; disabled?: boolean | string; description?: string }>
  ): Promise<T> {
    const answer = this.next("select", message);
    const stringValue = answer.value as string;
    const match = choices.find((c) => !c.disabled && String(c.value) === stringValue);
    if (match === undefined) {
      throw new Error(
        `ScriptedPrompter: no enabled choice with value "${stringValue}" for "${message}"`
      );
    }
    return match.value;
  }

  async checkbox<T>(
    message: string,
    choices: Array<{ name: string; value: T; checked?: boolean; disabled?: boolean | string }>
  ): Promise<T[]> {
    if (this.index >= this.queue.length) {
      return choices.filter((c) => c.checked === true && !c.disabled).map((c) => c.value);
    }
    const answer = this.next("checkbox", message);
    const selectedValues = new Set(answer.value as string[]);
    return choices
      .filter((c) => !c.disabled && selectedValues.has(String(c.value)))
      .map((c) => c.value);
  }

  private next(type: string, context: string): PromptAnswer {
    if (this.index >= this.queue.length) {
      throw new Error(
        `ScriptedPrompter: unexpected prompt call (type="${type}", context="${context}") — queue exhausted`
      );
    }
    const answer = this.queue[this.index++];
    if (answer === undefined) {
      throw new Error(`ScriptedPrompter: answer at index ${this.index - 1} is undefined`);
    }
    return answer;
  }

  // ── Builder helpers ────────────────────────────────────────────────────────

  static answer = {
    conflict(value: "keep" | "overwrite"): PromptAnswer {
      return { type: "conflict", value };
    },
    conflictBulk(value: "keep" | "overwrite" | "overwrite-all" | "skip-all"): PromptAnswer {
      return { type: "conflict-bulk", value };
    },
    confirm(value: boolean): PromptAnswer {
      return { type: "confirm", value };
    },
    input(value: string): PromptAnswer {
      return { type: "input", value };
    },
    select(value: string): PromptAnswer {
      return { type: "select", value };
    },
    checkbox(value: string[]): PromptAnswer {
      return { type: "checkbox", value };
    },
  };
}

/**
 * Always-overwrite variant — convenience for tests that don't care about conflicts.
 */
export class OverwritePrompter implements Prompter {
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

  async confirm(_message: string, _defaultValue?: boolean): Promise<boolean> {
    return true;
  }

  async input(_message: string, defaultValue?: string): Promise<string> {
    return defaultValue ?? "";
  }

  async select<T>(
    _message: string,
    choices: Array<{ name: string; value: T; disabled?: boolean | string }>
  ): Promise<T> {
    const first = choices.find((c) => !c.disabled);
    if (first === undefined) throw new Error("OverwritePrompter: no enabled choices");
    return first.value;
  }

  async checkbox<T>(
    _message: string,
    choices: Array<{ name: string; value: T; checked?: boolean; disabled?: boolean | string }>
  ): Promise<T[]> {
    return choices.filter((c) => c.checked === true && !c.disabled).map((c) => c.value);
  }
}

/**
 * Always-keep variant — convenience for tests that preserve user files.
 */
export class KeepPrompter implements Prompter {
  async resolveConflict(
    _relativePath: string,
    _reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite"> {
    return "keep";
  }

  async resolveConflictBulk(
    _relativePath: string,
    _reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite" | "overwrite-all" | "skip-all"> {
    return "keep";
  }

  async confirm(_message: string, _defaultValue?: boolean): Promise<boolean> {
    return true;
  }

  async input(_message: string, defaultValue?: string): Promise<string> {
    return defaultValue ?? "";
  }

  async select<T>(
    _message: string,
    choices: Array<{ name: string; value: T; disabled?: boolean | string }>
  ): Promise<T> {
    const first = choices.find((c) => !c.disabled);
    if (first === undefined) throw new Error("KeepPrompter: no enabled choices");
    return first.value;
  }

  async checkbox<T>(
    _message: string,
    choices: Array<{ name: string; value: T; checked?: boolean; disabled?: boolean | string }>
  ): Promise<T[]> {
    return choices.filter((c) => c.checked === true && !c.disabled).map((c) => c.value);
  }
}
