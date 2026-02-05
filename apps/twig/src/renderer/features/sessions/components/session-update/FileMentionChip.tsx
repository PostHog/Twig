import { FileIcon } from "@components/ui/FileIcon";
import { usePanelLayoutStore } from "@features/panels";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { Flex, Text } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc/client";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { memo, useCallback } from "react";
import { getFilename } from "./toolCallUtils";

interface FileMentionChipProps {
  filePath: string;
}

function toRelativePath(absolutePath: string, repoPath: string | null): string {
  if (!absolutePath) return absolutePath;
  if (!repoPath) return absolutePath;
  const normalizedRepo = repoPath.endsWith("/")
    ? repoPath.slice(0, -1)
    : repoPath;
  if (absolutePath.startsWith(`${normalizedRepo}/`)) {
    return absolutePath.slice(normalizedRepo.length + 1);
  }
  if (absolutePath === normalizedRepo) {
    return "";
  }
  return absolutePath;
}

export const FileMentionChip = memo(function FileMentionChip({
  filePath,
}: FileMentionChipProps) {
  const taskId = useTaskStore((s) => s.selectedTaskId);
  const repoPath = useCwd(taskId ?? "");
  const workspace = useWorkspaceStore((s) =>
    taskId ? s.workspaces[taskId] : null,
  );
  const openFileInSplit = usePanelLayoutStore((s) => s.openFileInSplit);

  const filename = getFilename(filePath);
  const mainRepoPath = workspace?.folderPath;

  const handleClick = useCallback(() => {
    if (!taskId) return;
    const relativePath = toRelativePath(filePath, repoPath ?? null);
    openFileInSplit(taskId, relativePath, true);
  }, [taskId, filePath, repoPath, openFileInSplit]);

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      const absolutePath = filePath.startsWith("/")
        ? filePath
        : repoPath
          ? `${repoPath}/${filePath}`
          : filePath;

      const result = await trpcVanilla.contextMenu.showFileContextMenu.mutate({
        filePath: absolutePath,
        showCollapseAll: false,
      });

      if (!result.action) return;

      if (result.action.type === "external-app") {
        await handleExternalAppAction(
          result.action.action,
          absolutePath,
          filename,
          { workspace, mainRepoPath },
        );
      }
    },
    [filePath, repoPath, filename, workspace, mainRepoPath],
  );

  const isClickable = !!taskId;

  return (
    <Flex
      align="center"
      gap="1"
      asChild
      onClick={isClickable ? handleClick : undefined}
      onContextMenu={handleContextMenu}
      className={isClickable ? "cursor-pointer hover:underline" : ""}
    >
      <Text size="1">
        <FileIcon filename={filename} size={12} />
        {filename}
      </Text>
    </Flex>
  );
});
