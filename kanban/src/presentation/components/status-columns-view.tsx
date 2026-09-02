import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import type {
  ListTaskDocumentsFilters,
  ListTaskDocumentsUseCase,
} from "../../application/use-cases/list-task-documents.js";
import type { Board } from "../../domain/models/board.js";
import type { TaskDocumentWatcher } from "../../domain/ports/task-document-watcher.js";
import { StatusColumn } from "./status-column.js";

const FALLBACK_TERMINAL_WIDTH = 100;
const MIN_COLUMN_WIDTH = 14;
const HEADER_TEXT = "aidd kanban — interactive";
const FOOTER_HINT_TEXT = "q quit";
const EMPTY_FILTERS: ListTaskDocumentsFilters = {};
const EMPTY_BOARD: Board = { columns: [] };

export interface StatusColumnsViewProps {
  listTaskDocuments: ListTaskDocumentsUseCase;
  projectPath: string;
  filters?: ListTaskDocumentsFilters;
  terminalWidth?: number;
  createWatcher?: () => TaskDocumentWatcher;
}

interface FetchedBoard {
  board: Board;
  fetchError: string | undefined;
}

function describeFetchError(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `Failed to load task documents: ${reason}`;
}

function useFetchedBoard(
  listTaskDocuments: ListTaskDocumentsUseCase,
  projectPath: string,
  filters: ListTaskDocumentsFilters,
  createWatcher: (() => TaskDocumentWatcher) | undefined
): FetchedBoard {
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const [fetchError, setFetchError] = useState<string | undefined>(undefined);

  const loadBoard = useCallback(() => {
    listTaskDocuments
      .execute(projectPath, filters)
      .then(setBoard)
      .catch((error: unknown) => {
        setFetchError(describeFetchError(error));
      });
  }, [listTaskDocuments, projectPath, filters]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useLiveRefresh(createWatcher, projectPath, loadBoard);

  return { board, fetchError };
}

function useLiveRefresh(
  createWatcher: (() => TaskDocumentWatcher) | undefined,
  projectPath: string,
  onTaskDocumentChange: () => void
): void {
  useEffect(() => {
    if (createWatcher === undefined) {
      return;
    }
    const watcher = createWatcher();
    watcher.onChange(onTaskDocumentChange);
    watcher.start(projectPath);
    return () => watcher.stop();
  }, [createWatcher, projectPath, onTaskDocumentChange]);
}

function useQuitControl(exit: () => void): void {
  useInput((input) => {
    if (input === "q") {
      exit();
    }
  });
}

function resolveColumnWidth(resolvedWidth: number, columnCount: number): number {
  return Math.max(MIN_COLUMN_WIDTH, Math.floor(resolvedWidth / Math.max(columnCount, 1)));
}

function FetchErrorMessage({ message }: { message: string }) {
  return (
    <Box flexDirection="column">
      <Text bold>{HEADER_TEXT}</Text>
      <Text color="red">{message}</Text>
    </Box>
  );
}

interface StatusColumnsBoardProps {
  board: Board;
  columnWidth: number;
}

function StatusColumnsBoard({ board, columnWidth }: StatusColumnsBoardProps) {
  return (
    <Box flexDirection="column">
      <Text bold>{HEADER_TEXT}</Text>
      <Box flexDirection="row">
        {board.columns.map((column) => (
          <StatusColumn
            key={column.progressStatus}
            label={column.label}
            taskGroups={column.taskGroups}
            width={columnWidth}
          />
        ))}
      </Box>
      <Text dimColor>{FOOTER_HINT_TEXT}</Text>
    </Box>
  );
}

export function StatusColumnsView({
  listTaskDocuments,
  projectPath,
  filters = EMPTY_FILTERS,
  terminalWidth,
  createWatcher,
}: StatusColumnsViewProps) {
  const { exit } = useApp();
  useQuitControl(exit);
  const { board, fetchError } = useFetchedBoard(
    listTaskDocuments,
    projectPath,
    filters,
    createWatcher
  );
  const resolvedWidth = terminalWidth ?? process.stdout.columns ?? FALLBACK_TERMINAL_WIDTH;

  if (fetchError !== undefined) {
    return <FetchErrorMessage message={fetchError} />;
  }

  return (
    <StatusColumnsBoard
      board={board}
      columnWidth={resolveColumnWidth(resolvedWidth, board.columns.length)}
    />
  );
}
