import { PanelMessage } from "@components/ui/PanelMessage";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { Box } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc/client";
import type { Task } from "@shared/types";

interface CodeEditorPanelProps {
  taskId: string;
  task: Task;
  absolutePath: string;
}

export function CodeEditorPanel({
  taskId,
  task: _task,
  absolutePath,
}: CodeEditorPanelProps) {
  const repoPath = useCwd(taskId);
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
