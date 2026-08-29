import { Box, Text, useApp, useInput } from "ink";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import type {
  ListTaskDocumentsFilters,
  ListTaskDocumentsUseCase,
} from "../../application/use-cases/list-task-documents.js";
import type { TaskGroup } from "../../domain/models/task-group.js";
import {
  collectDistinctParentStatuses,
  groupTaskGroupsByParentStatus,
} from "../status-grouping.js";
import { StatusColumn } from "./status-column.js";

const FALLBACK_TERMINAL_WIDTH = 100;
const MIN_COLUMN_WIDTH = 14;
const HEADER_TEXT = "aidd kanban — interactive";
const FOOTER_HINT_TEXT = "↑/↓ select · q quit";
const EMPTY_FILTERS: ListTaskDocumentsFilters = {};

export interface StatusColumnsViewProps {
  listTaskDocuments: ListTaskDocumentsUseCase;
  projectPath: string;
  filters?: ListTaskDocumentsFilters;
  terminalWidth?: number;
}

interface FetchedTaskGroups {
  taskGroups: TaskGroup[];
  fetchError: string | undefined;
}

function computeVisibleColumnCount(terminalWidth: number, totalColumns: number): number {
  if (totalColumns === 0) {
    return 0;
  }

  const maxColumnsThatFit = Math.max(1, Math.floor(terminalWidth / MIN_COLUMN_WIDTH));
  return Math.min(totalColumns, maxColumnsThatFit);
}

function clampToRange(value: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  return Math.min(Math.max(value, 0), length - 1);
}

function describeFetchError(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `Failed to load task documents: ${reason}`;
}

function useFetchedTaskGroups(
  listTaskDocuments: ListTaskDocumentsUseCase,
  projectPath: string,
  filters: ListTaskDocumentsFilters
): FetchedTaskGroups {
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [fetchError, setFetchError] = useState<string | undefined>(undefined);

  useEffect(() => {
    listTaskDocuments
      .execute(projectPath, filters)
      .then(setTaskGroups)
      .catch((error: unknown) => {
        setFetchError(describeFetchError(error));
      });
  }, [listTaskDocuments, projectPath, filters]);

  return { taskGroups, fetchError };
}

function useColumnNavigation(totalColumns: number, visibleColumnCount: number) {
  const [columnOffset, setColumnOffset] = useState(0);
  const maxColumnOffset = Math.max(0, totalColumns - visibleColumnCount);
  const shiftColumnOffset = (delta: number): void => {
    setColumnOffset((current) => Math.min(Math.max(current + delta, 0), maxColumnOffset));
  };

  return { columnOffset: Math.min(columnOffset, maxColumnOffset), shiftColumnOffset };
}

function useColumnAndSelectionControls(
  exit: () => void,
  taskGroupCount: number,
  shiftColumnOffset: (delta: number) => void,
  setSelectedIndex: Dispatch<SetStateAction<number>>
): void {
  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((current) => clampToRange(current + 1, taskGroupCount));
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((current) => clampToRange(current - 1, taskGroupCount));
      return;
    }

    if (key.rightArrow) {
      shiftColumnOffset(1);
      return;
    }

    if (key.leftArrow) {
      shiftColumnOffset(-1);
    }
  });
}

interface StatusColumnsLayout {
  visibleStatuses: string[];
  totalColumnCount: number;
  taskGroupsByStatus: Map<string, TaskGroup[]>;
  columnWidth: number;
  selectedTaskGroup: TaskGroup | undefined;
}

function useStatusColumnsLayout(
  taskGroups: TaskGroup[],
  resolvedWidth: number,
  exit: () => void
): StatusColumnsLayout {
  const statuses = collectDistinctParentStatuses(taskGroups);
  const taskGroupsByStatus = groupTaskGroupsByParentStatus(taskGroups, statuses);
  const visibleColumnCount = computeVisibleColumnCount(resolvedWidth, statuses.length);
  const { columnOffset, shiftColumnOffset } = useColumnNavigation(
    statuses.length,
    visibleColumnCount
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  useColumnAndSelectionControls(exit, taskGroups.length, shiftColumnOffset, setSelectedIndex);

  const visibleStatuses = statuses.slice(columnOffset, columnOffset + visibleColumnCount);
  const columnWidth = Math.max(
    MIN_COLUMN_WIDTH,
    Math.floor(resolvedWidth / Math.max(visibleColumnCount, 1))
  );
  const selectedTaskGroup = taskGroups[clampToRange(selectedIndex, taskGroups.length)];

  return {
    visibleStatuses,
    totalColumnCount: statuses.length,
    taskGroupsByStatus,
    columnWidth,
    selectedTaskGroup,
  };
}

function FetchErrorMessage({ message }: { message: string }) {
  return (
    <Box flexDirection="column">
      <Text bold>{HEADER_TEXT}</Text>
      <Text color="red">{message}</Text>
    </Box>
  );
}

type StatusColumnsRowProps = Omit<StatusColumnsLayout, "totalColumnCount">;

function StatusColumnsRow({
  visibleStatuses,
  taskGroupsByStatus,
  columnWidth,
  selectedTaskGroup,
}: StatusColumnsRowProps) {
  return (
    <Box flexDirection="row">
      {visibleStatuses.map((status) => (
        <StatusColumn
          key={status}
          status={status}
          taskGroups={taskGroupsByStatus.get(status) ?? []}
          width={columnWidth}
          selectedFilePath={selectedTaskGroup?.parent.filePath}
        />
      ))}
    </Box>
  );
}

interface HiddenColumnsNoticeProps {
  visibleColumnCount: number;
  totalColumnCount: number;
}

function HiddenColumnsNotice({ visibleColumnCount, totalColumnCount }: HiddenColumnsNoticeProps) {
  if (totalColumnCount <= visibleColumnCount) {
    return null;
  }

  return (
    <Text dimColor>
      ‹ {visibleColumnCount}/{totalColumnCount} columns · → more ›
    </Text>
  );
}

function StatusColumnsBoard(layout: StatusColumnsLayout) {
  return (
    <Box flexDirection="column">
      <Text bold>{HEADER_TEXT}</Text>
      <StatusColumnsRow {...layout} />
      <Text dimColor>{FOOTER_HINT_TEXT}</Text>
      <HiddenColumnsNotice
        visibleColumnCount={layout.visibleStatuses.length}
        totalColumnCount={layout.totalColumnCount}
      />
    </Box>
  );
}

export function StatusColumnsView({
  listTaskDocuments,
  projectPath,
  filters = EMPTY_FILTERS,
  terminalWidth,
}: StatusColumnsViewProps) {
  const { exit } = useApp();
  const { taskGroups, fetchError } = useFetchedTaskGroups(listTaskDocuments, projectPath, filters);
  const resolvedWidth = terminalWidth ?? process.stdout.columns ?? FALLBACK_TERMINAL_WIDTH;
  const layout = useStatusColumnsLayout(taskGroups, resolvedWidth, exit);

  if (fetchError !== undefined) {
    return <FetchErrorMessage message={fetchError} />;
  }

  return <StatusColumnsBoard {...layout} />;
}
