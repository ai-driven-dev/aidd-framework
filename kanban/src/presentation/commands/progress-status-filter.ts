import { isProgressStatus, type ProgressStatus } from "../../domain/models/progress-status.js";

export function toProgressStatusFilter(progress: string | undefined): ProgressStatus | undefined {
  if (progress === undefined || !isProgressStatus(progress)) {
    return undefined;
  }

  return progress;
}
