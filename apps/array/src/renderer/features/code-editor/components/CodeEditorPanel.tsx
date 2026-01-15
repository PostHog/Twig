import { PanelMessage } from "@components/ui/PanelMessage";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Box } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import {
  selectWorkspacePath,
  useWorkspaceStore,
} from "@/renderer/features/workspace/stores/workspaceStore";

interface CodeEditorPanelProps {
  taskId: string;
  task: Task | null;
  absolutePath: string;
  /** Direct repo path - used when no task is available (e.g., dashboard) */
  repoPath?: string;
}

export function CodeEditorPanel({
  taskId,
  task,
  absolutePath,
  repoPath: directRepoPath,
}: CodeEditorPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const workspacePath = useWorkspaceStore(selectWorkspacePath(taskId));
  const repoPath = directRepoPath ?? workspacePath ?? taskData.repoPath;
  const filePath = getRelativePath(absolutePath, repoPath);

  const {
    data: fileContent,
    isLoading,
    error,
  } = trpcReact.fs.readRepoFile.useQuery(
    { repoPath: repoPath ?? "", filePath: filePath ?? "" },
    {
      enabled: !!repoPath && !!filePath,
      staleTime: Infinity,
    },
  );

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading file...</PanelMessage>;
  }

  if (error || fileContent == null) {
    return <PanelMessage>Failed to load file</PanelMessage>;
  }

  // If we ever allow editing in the CodeMirrorEditor, this can be removed
  if (fileContent.length === 0) {
    return <PanelMessage>File is empty</PanelMessage>;
  }

  return (
    <Box height="100%" style={{ overflow: "hidden" }}>
      <CodeMirrorEditor
        content={fileContent}
        filePath={absolutePath}
        relativePath={filePath}
        readOnly
      />
    </Box>
  );
}
