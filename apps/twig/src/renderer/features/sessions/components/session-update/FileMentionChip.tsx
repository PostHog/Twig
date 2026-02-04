import { FileIcon } from "@components/ui/FileIcon";
import { usePanelLayoutStore } from "@features/panels";
import { DEFAULT_PANEL_IDS } from "@features/panels/constants/panelConstants";
import { createFileTabId } from "@features/panels/store/panelStoreHelpers";
import { findTabInTree } from "@features/panels/store/panelTree";
import type { PanelNode } from "@features/panels/store/panelTypes";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { Flex, Text } from "@radix-ui/themes";
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

function findNonMainLeafPanel(node: PanelNode): string | null {
  if (node.type === "leaf") {
    return node.id !== DEFAULT_PANEL_IDS.MAIN_PANEL ? node.id : null;
  }
  for (const child of node.children) {
    const found = findNonMainLeafPanel(child);
    if (found) return found;
  }
  return null;
}

export const FileMentionChip = memo(function FileMentionChip({
  filePath,
}: FileMentionChipProps) {
  const taskId = useTaskStore((s) => s.selectedTaskId);
  const repoPath = useCwd(taskId ?? "");
  const getLayout = usePanelLayoutStore((s) => s.getLayout);
  const openFile = usePanelLayoutStore((s) => s.openFile);
  const splitPanel = usePanelLayoutStore((s) => s.splitPanel);
  const setFocusedPanel = usePanelLayoutStore((s) => s.setFocusedPanel);

  const filename = getFilename(filePath);

  const handleClick = useCallback(() => {
    if (!taskId) return;

    const relativePath = toRelativePath(filePath, repoPath ?? null);
    const tabId = createFileTabId(relativePath);
    const layout = getLayout(taskId);

    if (layout) {
      const existingTab = findTabInTree(layout.panelTree, tabId);
      if (existingTab) {
        openFile(taskId, relativePath, true);
        return;
      }

      const isMainPanelOnly =
        layout.panelTree.type === "leaf" &&
        layout.panelTree.id === DEFAULT_PANEL_IDS.MAIN_PANEL;

      if (isMainPanelOnly) {
        openFile(taskId, relativePath, true);
        splitPanel(
          taskId,
          tabId,
          DEFAULT_PANEL_IDS.MAIN_PANEL,
          DEFAULT_PANEL_IDS.MAIN_PANEL,
          "right",
        );
        return;
      }

      const targetPanelId = findNonMainLeafPanel(layout.panelTree);
      if (targetPanelId) {
        setFocusedPanel(taskId, targetPanelId);
        openFile(taskId, relativePath, true);
        return;
      }
    }

    openFile(taskId, relativePath, true);
  }, [
    taskId,
    filePath,
    repoPath,
    getLayout,
    openFile,
    splitPanel,
    setFocusedPanel,
  ]);

  const isClickable = !!taskId;

  return (
    <Flex
      align="center"
      gap="1"
      asChild
      onClick={isClickable ? handleClick : undefined}
      className={isClickable ? "cursor-pointer hover:underline" : ""}
    >
      <Text size="1">
        <FileIcon filename={filename} size={12} />
        {filename}
      </Text>
    </Flex>
  );
});
