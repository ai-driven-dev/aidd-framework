import type { ProgressStatus } from "./progress-status.js";

export interface TaskDocument {
  name: string;
  description: string;
  type: string;
  status: string;
  progressStatus: ProgressStatus;
  filePath: string;
}
