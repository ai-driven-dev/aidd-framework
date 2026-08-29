import { UNKNOWN_DOCUMENT_STATUS } from "./document-status.js";

export const PROGRESS_STATUS_TODO = "todo";
export const PROGRESS_STATUS_IN_PROGRESS = "in-progress";
export const PROGRESS_STATUS_DONE = "done";
export const PROGRESS_STATUS_BLOCKED = "blocked";
export const PROGRESS_STATUS_UNKNOWN = "unknown";

export type ProgressStatus =
  | typeof PROGRESS_STATUS_TODO
  | typeof PROGRESS_STATUS_IN_PROGRESS
  | typeof PROGRESS_STATUS_DONE
  | typeof PROGRESS_STATUS_BLOCKED
  | typeof PROGRESS_STATUS_UNKNOWN;

export const PROGRESS_STATUSES_IN_COLUMN_ORDER: readonly ProgressStatus[] = [
  PROGRESS_STATUS_TODO,
  PROGRESS_STATUS_IN_PROGRESS,
  PROGRESS_STATUS_DONE,
  PROGRESS_STATUS_BLOCKED,
  PROGRESS_STATUS_UNKNOWN,
];

const RAW_STATUS_TO_PROGRESS_STATUS: Record<string, ProgressStatus> = {
  pending: PROGRESS_STATUS_TODO,
  proposed: PROGRESS_STATUS_TODO,
  open: PROGRESS_STATUS_TODO,
  reported: PROGRESS_STATUS_TODO,
  "in-progress": PROGRESS_STATUS_IN_PROGRESS,
  done: PROGRESS_STATUS_DONE,
  implemented: PROGRESS_STATUS_DONE,
  reviewed: PROGRESS_STATUS_DONE,
  blocked: PROGRESS_STATUS_BLOCKED,
  [UNKNOWN_DOCUMENT_STATUS]: PROGRESS_STATUS_UNKNOWN,
};

export function deriveProgressStatus(normalizedDocumentStatus: string): ProgressStatus {
  return RAW_STATUS_TO_PROGRESS_STATUS[normalizedDocumentStatus] ?? PROGRESS_STATUS_UNKNOWN;
}

const PROGRESS_STATUS_MEMBERS: ReadonlySet<string> = new Set(PROGRESS_STATUSES_IN_COLUMN_ORDER);

export function isProgressStatus(value: string): value is ProgressStatus {
  return PROGRESS_STATUS_MEMBERS.has(value);
}
