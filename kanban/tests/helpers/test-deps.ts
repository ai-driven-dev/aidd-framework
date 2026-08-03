import type { KanbanCommandDeps } from "../../src/presentation/kanban-deps.js";
import { DOCS_DIRECTORY_NAME } from "./docs-directory.js";

/**
 * The deps a host CLI would inject, wired so printed output still lands on `console.log`
 * and the existing spies keep observing what the user would see.
 */
export function createTestKanbanDeps(): KanbanCommandDeps {
  return {
    docsDirectoryName: DOCS_DIRECTORY_NAME,
    onError(error: unknown): never {
      throw error;
    },
    output: {
      print(message: string): void {
        console.log(message);
      },
    },
  };
}
