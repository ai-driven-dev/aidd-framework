import { existsSync, type FSWatcher, watch } from "node:fs";
import { join } from "node:path";
import type {
  TaskDocumentChangeCallback,
  TaskDocumentWatcher,
} from "../../domain/ports/task-document-watcher.js";

const DEBOUNCE_MS = 500;

export class FilesystemTaskDocumentWatcher implements TaskDocumentWatcher {
  private fsWatcher: FSWatcher | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private callback: TaskDocumentChangeCallback | undefined;

  constructor(private readonly docsDirectoryName: string) {}

  onChange(callback: TaskDocumentChangeCallback): void {
    this.callback = callback;
  }

  start(projectPath: string): void {
    this.watchDirectory(projectPath);
  }

  retarget(projectPath: string): void {
    this.stop();
    this.watchDirectory(projectPath);
  }

  private watchDirectory(projectPath: string): void {
    const watchPath = join(projectPath, this.docsDirectoryName);

    if (!existsSync(watchPath)) {
      return;
    }

    this.fsWatcher = watch(watchPath, { recursive: true }, (_event, filename) => {
      if (filename === null || !filename.endsWith(".md")) {
        return;
      }

      this.scheduleNotify();
    });
  }

  stop(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    if (this.fsWatcher !== undefined) {
      this.fsWatcher.close();
      this.fsWatcher = undefined;
    }
  }

  private scheduleNotify(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.callback?.();
    }, DEBOUNCE_MS);
  }
}
