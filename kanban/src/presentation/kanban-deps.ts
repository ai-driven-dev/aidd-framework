/**
 * Everything the kanban commands need from their host CLI.
 *
 * The kanban source is a folder inside the framework, not a standalone package: it
 * never reaches for the host's modules itself. The host builds this object and hands
 * it over at registration time, so the docs directory name and the output channel
 * stay owned by whoever mounts the commands.
 */
export interface KanbanOutput {
  print(message: string): void;
}

export interface KanbanCommandDeps {
  /** Name of the directory holding the task documents, relative to the project path. */
  docsDirectoryName: string;
  output: KanbanOutput;
  /** Called with anything the command action throws, so the host owns how failures surface. */
  onError(error: unknown): void;
}
