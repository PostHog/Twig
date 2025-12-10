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

  // Fetch PR for the current branch
  const { data: prInfo } = useQuery({
    queryKey: ["pr-for-branch", repoPath],
    enabled: !!repoPath,
    staleTime: 30_000, // Cache for 30 seconds
    queryFn: async () => {
      if (!window.electronAPI || !repoPath) {
        return null;
      }
      return window.electronAPI.prComments.getPrForBranch(repoPath);
    },
  });

  // Use PR from branch lookup, or fall back to task output
  const prUrl =
    prInfo?.url ?? (task.latest_run?.output?.pr_url as string | undefined);
  const prNumber =
    prInfo?.number ??
    (prUrl ? parseInt(prUrl.split("/").pop() || "0", 10) : undefined);

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
        readOnly
        prNumber={prNumber}
      />
    </Box>
  );
}
