import type { TaskGroup } from "../domain/models/task-group.js";

const CANONICAL_STATUS_ORDER = ["pending", "in-progress", "implemented", "reviewed", "blocked"];

export function collectDistinctParentStatuses(taskGroups: TaskGroup[]): string[] {
  const distinctStatuses: string[] = [];

  for (const taskGroup of taskGroups) {
    if (!distinctStatuses.includes(taskGroup.parent.status)) {
      distinctStatuses.push(taskGroup.parent.status);
    }
  }

  const canonicalStatuses = CANONICAL_STATUS_ORDER.filter((status) =>
    distinctStatuses.includes(status)
  );
  const nonCanonicalStatuses = distinctStatuses.filter(
    (status) => !CANONICAL_STATUS_ORDER.includes(status)
  );

  return [...canonicalStatuses, ...nonCanonicalStatuses];
}

export function groupTaskGroupsByParentStatus(
  taskGroups: TaskGroup[],
  statuses: string[]
): Map<string, TaskGroup[]> {
  const taskGroupsByStatus = new Map<string, TaskGroup[]>(statuses.map((status) => [status, []]));

  for (const taskGroup of taskGroups) {
    taskGroupsByStatus.get(taskGroup.parent.status)?.push(taskGroup);
  }

  return taskGroupsByStatus;
}
