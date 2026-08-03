import { basename, dirname } from "node:path";
import type { TaskDocument } from "./task-document.js";

export interface TaskGroup {
  parent: TaskDocument;
  subDocuments: TaskDocument[];
}

const PARENT_FILE_NAMES: readonly string[] = ["plan.md", "master-plan.md"];
const FALLBACK_PARENT_FILE_NAME = "spec.md";

export function isParentEligibleFileName(fileName: string): boolean {
  return PARENT_FILE_NAMES.includes(fileName) || fileName === FALLBACK_PARENT_FILE_NAME;
}

function groupByDirectory(taskDocuments: TaskDocument[]): Map<string, TaskDocument[]> {
  const taskDocumentsByDirectory = new Map<string, TaskDocument[]>();

  for (const taskDocument of taskDocuments) {
    const directoryPath = dirname(taskDocument.filePath);
    const existingGroup = taskDocumentsByDirectory.get(directoryPath);

    if (existingGroup === undefined) {
      taskDocumentsByDirectory.set(directoryPath, [taskDocument]);
      continue;
    }

    existingGroup.push(taskDocument);
  }

  return taskDocumentsByDirectory;
}

function electParent(taskDocuments: TaskDocument[]): TaskDocument {
  const primaryParent = taskDocuments.find((taskDocument) =>
    PARENT_FILE_NAMES.includes(basename(taskDocument.filePath))
  );

  if (primaryParent !== undefined) {
    return primaryParent;
  }

  const fallbackParent = taskDocuments.find((taskDocument) =>
    isParentEligibleFileName(basename(taskDocument.filePath))
  );

  return fallbackParent ?? taskDocuments[0];
}

export function groupTaskDocumentsByDirectory(taskDocuments: TaskDocument[]): TaskGroup[] {
  const taskDocumentsByDirectory = groupByDirectory(taskDocuments);
  const taskGroups: TaskGroup[] = [];

  for (const directoryTaskDocuments of taskDocumentsByDirectory.values()) {
    const parent = electParent(directoryTaskDocuments);
    const subDocuments = directoryTaskDocuments.filter((taskDocument) => taskDocument !== parent);

    taskGroups.push({ parent, subDocuments });
  }

  return taskGroups;
}
