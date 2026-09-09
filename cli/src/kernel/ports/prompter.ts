export interface Prompter {
  resolveConflict(
    relativePath: string,
    reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite">;
  resolveConflictBulk(
    relativePath: string,
    reason: "deleted" | "modified"
  ): Promise<"keep" | "overwrite" | "overwrite-all" | "skip-all">;
  confirm(message: string, defaultValue?: boolean): Promise<boolean>;
  input(message: string, defaultValue?: string): Promise<string>;
  select<T>(
    message: string,
    choices: Array<{ name: string; value: T; disabled?: boolean | string; description?: string }>
  ): Promise<T>;
  checkbox<T>(
    message: string,
    choices: Array<{ name: string; value: T; checked?: boolean; disabled?: boolean | string }>
  ): Promise<T[]>;
}
