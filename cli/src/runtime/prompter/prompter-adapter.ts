import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { InputRequiredError } from "../../application/errors.js";
import type { Prompter } from "../../domain/ports/prompter.js";

type PromptContext = {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
};

export class SilentPrompterAdapter implements Prompter {
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
    if (first === undefined) {
      throw new InputRequiredError("No enabled choices available");
    }
    return first.value;
  }

  async checkbox<T>(
    _message: string,
    choices: Array<{ name: string; value: T; checked?: boolean; disabled?: boolean | string }>
  ): Promise<T[]> {
    return choices.filter((c) => c.checked === true && !c.disabled).map((c) => c.value);
  }
}

export class InquirerPrompterAdapter implements Prompter {
  constructor(private readonly context?: PromptContext) {}

  private conflictMessage(relativePath: string, reason: "deleted" | "modified"): string {
    const description = reason === "deleted" ? "was deleted" : "was locally modified";
    return `Conflict: ${relativePath} ${description}. What do you want to do?`;
  }

  async resolveConflict(
    relativePath: string,
    reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite"> {
    return select(
      {
        message: this.conflictMessage(relativePath, reason),
        choices: [
          { name: "Overwrite with latest version", value: "overwrite" as const },
          { name: "Keep my local version", value: "keep" as const },
        ],
      },
      this.context
    );
  }

  async resolveConflictBulk(
    relativePath: string,
    reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite" | "overwrite-all" | "skip-all"> {
    return select(
      {
        message: this.conflictMessage(relativePath, reason),
        choices: [
          { name: "Overwrite with latest version", value: "overwrite" as const },
          { name: "Keep my local version", value: "keep" as const },
          { name: "Overwrite all remaining conflicts", value: "overwrite-all" as const },
          { name: "Skip all remaining conflicts", value: "skip-all" as const },
        ],
      },
      this.context
    );
  }

  async confirm(message: string, defaultValue?: boolean): Promise<boolean> {
    return confirm({ message, default: defaultValue ?? false }, this.context);
  }

  async input(message: string, defaultValue?: string): Promise<string> {
    return input({ message, default: defaultValue }, this.context);
  }

  async select<T>(
    message: string,
    choices: Array<{ name: string; value: T; disabled?: boolean | string; description?: string }>
  ): Promise<T> {
    return select(
      {
        message,
        choices: choices.map((c) => ({
          name: c.name,
          value: c.value,
          disabled: c.disabled === true ? "Disabled" : c.disabled || false,
          description: c.description,
        })),
      },
      this.context
    );
  }

  async checkbox<T>(
    message: string,
    choices: Array<{ name: string; value: T; checked?: boolean; disabled?: boolean | string }>
  ): Promise<T[]> {
    return checkbox(
      {
        message,
        choices: choices.map((c) => ({
          name: c.name,
          value: c.value,
          checked: c.checked,
          disabled: c.disabled,
        })),
      },
      this.context
    );
  }
}
