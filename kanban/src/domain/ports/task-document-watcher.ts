export type TaskDocumentChangeCallback = () => void;

export interface TaskDocumentWatcher {
  start(projectPath: string): void;
  stop(): void;
  onChange(callback: TaskDocumentChangeCallback): void;
}
