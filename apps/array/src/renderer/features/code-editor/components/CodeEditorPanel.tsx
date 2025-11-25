import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Box, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";

interface CodeEditorPanelProps {
  taskId: string;
  task: Task;
  filePath: string;
}

export function CodeEditorPanel({
  taskId,
  task,
  filePath,
}: CodeEditorPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const repoPath = taskData.repoPath;

  const {
    data: fileContent,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["repo-file", repoPath, filePath],
    enabled: !!repoPath && !!filePath,
    staleTime: 30000,
    queryFn: async () => {
      if (!window.electronAPI || !repoPath || !filePath) {
        return null;
      }
      const content = await window.electronAPI.readRepoFile(repoPath, filePath);
      return content;
    },
  });

  if (!repoPath) {
    return (
      <Box height="100%" p="4">
        <Flex align="center" justify="center" height="100%">
          <Text size="2" color="gray">
            No repository path available
          </Text>
        </Flex>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box height="100%" p="4">
        <Flex align="center" justify="center" height="100%">
          <Text size="2" color="gray">
            Loading file...
          </Text>
        </Flex>
      </Box>
    );
  }

  if (error || !fileContent) {
    return (
      <Box height="100%" p="4">
        <Flex align="center" justify="center" height="100%">
          <Text size="2" color="gray">
            Failed to load file
          </Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box height="100%" style={{ overflow: "hidden" }}>
      <CodeMirrorEditor content={fileContent} filePath={filePath} readOnly />
    </Box>
  );
}
