import type { TaskBacklogReader } from "../../../src/contexts/telemetry/domain/ports/task-backlog-reader.js";
import type { TaskBacklogDeclaration } from "../../../src/contexts/telemetry/domain/task-backlog-link.js";

/** In-memory double for `TaskBacklogReader` — one declaration per task folder path, or
 * `{ kind: "none" }` for a path the map holds nothing for, mirroring the port's own
 * contract of never throwing. Lets the report's own tests exercise every axis with no
 * filesystem. */
export class InMemoryTaskBacklogReader implements TaskBacklogReader {
  private readonly declarations = new Map<string, TaskBacklogDeclaration>();

  set(taskFolderPath: string, declaration: TaskBacklogDeclaration): void {
    this.declarations.set(taskFolderPath, declaration);
  }

  async read(taskFolderPath: string): Promise<TaskBacklogDeclaration> {
    return this.declarations.get(taskFolderPath) ?? { kind: "none" };
  }
}
