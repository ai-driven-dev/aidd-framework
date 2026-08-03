import { Box, Text } from "ink";
import type { TaskGroup } from "../../domain/models/task-group.js";

const SUB_DOCUMENT_DETAIL_MIN_WIDTH = 24;

export interface StatusColumnProps {
  status: string;
  taskGroups: TaskGroup[];
  width: number;
  selectedFilePath?: string;
}

export function StatusColumn({ status, taskGroups, width, selectedFilePath }: StatusColumnProps) {
  const showSubDocuments = width >= SUB_DOCUMENT_DETAIL_MIN_WIDTH;

  return (
    <Box flexDirection="column" width={width} marginRight={1}>
      <Text bold wrap="truncate-end">
        {status.toUpperCase()}
      </Text>
      {taskGroups.map((taskGroup) => (
        <Box key={taskGroup.parent.filePath} flexDirection="column">
          <Text wrap="truncate-end" inverse={taskGroup.parent.filePath === selectedFilePath}>
            {taskGroup.parent.name}
          </Text>
          {showSubDocuments &&
            taskGroup.subDocuments.map((subDocument) => (
              <Text key={subDocument.filePath} dimColor wrap="truncate-end">
                {`- ${subDocument.name}: ${subDocument.status}`}
              </Text>
            ))}
        </Box>
      ))}
    </Box>
  );
}
