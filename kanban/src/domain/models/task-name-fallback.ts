import { basename, dirname } from "node:path";
import { isParentEligibleFileName } from "./task-group.js";

export function resolveTaskDocumentNameFallback(filePath: string): string {
  const fileName = basename(filePath);

  if (isParentEligibleFileName(fileName)) {
    return basename(dirname(filePath));
  }

  return basename(filePath, ".md");
}
