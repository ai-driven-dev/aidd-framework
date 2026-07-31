import type { TaskDocument } from "../models/task-document.js";

export interface TaskDocumentRepository {
  findAll(projectPath: string): Promise<TaskDocument[]>;
}
