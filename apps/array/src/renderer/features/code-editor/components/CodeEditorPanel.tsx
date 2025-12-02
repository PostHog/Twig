import { PanelMessage } from "@components/ui/PanelMessage";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Box } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import {
  selectWorktreePath,
  useWorkspaceStore,
} from "@/renderer/features/workspace/stores/workspaceStore";

interface CodeEditorPanelProps {
  taskId: string;
  task: Task;
  absolutePath: string;
}

export function CodeEditorPanel({
  taskId,
  task,
  absolutePath,
}: CodeEditorPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const worktreePath = useWorkspaceStore(selectWorktreePath(taskId));
  const repoPath = worktreePath ?? taskData.repoPath;
  const filePath = getRelativePath(absolutePath, repoPath);

  const {
    data: fileContent,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["repo-file", repoPath, filePath],
    enabled: !!repoPath && !!filePath,
    staleTime: Infinity,
    queryFn: async () => {
      if (!window.electronAPI || !repoPath || !filePath) {
        return null;
      }
      return window.electronAPI.readRepoFile(repoPath, filePath);
    },
  });

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading file...</PanelMessage>;
  }

  if (error || !fileContent) {
    return <PanelMessage>Failed to load file</PanelMessage>;
  }

  return (
    <Box height="100%" style={{ overflow: "hidden" }}>
      <CodeMirrorEditor
        content={fileContent}
        filePath={absolutePath}
        readOnly
      />
    </Box>
  );
}
