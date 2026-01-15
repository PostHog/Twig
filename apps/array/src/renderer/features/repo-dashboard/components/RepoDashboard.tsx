import { type DragDropEvents, DragDropProvider } from "@dnd-kit/react";
import { PanelLayout } from "@features/panels";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import type { Tab } from "@features/panels/store/panelTypes";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Folder, Plus } from "@phosphor-icons/react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import { basename } from "@renderer/utils/path";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useEffect, useMemo } from "react";
import {
  useDashboardActions,
  useDashboardStore,
} from "../stores/dashboardStore";
import { createDashboardPanelTree } from "../utils/createDashboardPanelTree";
import { DashboardTabContentRenderer } from "./DashboardTabContentRenderer";

export function RepoDashboard() {
  const { view, navigateToTaskInput } = useNavigationStore();
  const repoPath = view.type === "repo-dashboard" ? view.repoPath : undefined;

  const { assignFiles } = useDashboardActions(repoPath);
  const setDraggingFiles = useDashboardStore((s) => s.setDraggingFiles);
  const clearDragState = useDashboardStore((s) => s.clearDragState);

  const layoutId = repoPath ? `dashboard-${repoPath}` : "";
  const layout = usePanelLayoutStore((state) => state.getLayout(layoutId));
  const initializeCustomLayout = usePanelLayoutStore(
    (state) => state.initializeCustomLayout,
  );

  const repoName = repoPath ? basename(repoPath) : "Repository";

  const headerContent = useMemo(
    () => (
      <Flex align="center" gap="2">
        <Folder size={16} />
        <Text size="2" weight="medium">
          {repoName}
        </Text>
        <Button
          size="1"
          variant="soft"
          onClick={() => navigateToTaskInput()}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Plus size={14} />
          New Task
        </Button>
      </Flex>
    ),
    [repoName, navigateToTaskInput],
  );

  useSetHeaderContent(headerContent);

  // Initialize dashboard layout if not exists
  useEffect(() => {
    if (repoPath && !layout) {
      initializeCustomLayout(layoutId, createDashboardPanelTree(repoPath));
    }
  }, [repoPath, layout, layoutId, initializeCustomLayout]);

  // Drag-drop handlers for file assignment
  const handleDragStart: DragDropEvents["dragstart"] = useCallback(
    (event) => {
      const data = event.operation.source?.data;
      if (data?.type === "file" && data.file) {
        setDraggingFiles([data.file]);
      }
    },
    [setDraggingFiles],
  );

  const handleDragEnd: DragDropEvents["dragend"] = useCallback(
    async (event) => {
      if (event.canceled) {
        clearDragState();
        return;
      }

      const sourceData = event.operation.source?.data;
      const targetData = event.operation.target?.data;

      if (
        sourceData?.type === "file" &&
        targetData?.type === "workspace" &&
        sourceData.file &&
        targetData.workspace
      ) {
        await assignFiles([sourceData.file], targetData.workspace);
      } else {
        clearDragState();
      }
    },
    [assignFiles, clearDragState],
  );

  const renderContent = useCallback(
    (tab: Tab) => (
      <DashboardTabContentRenderer tab={tab} repoPath={repoPath ?? ""} />
    ),
    [repoPath],
  );

  if (!repoPath) {
    return (
      <Flex align="center" justify="center" height="100%">
        <Text color="gray">No repository selected</Text>
      </Flex>
    );
  }

  if (!layout) {
    return null;
  }

  return (
    <DragDropProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <Box height="100%">
        <PanelLayout
          layoutId={layoutId}
          renderContent={renderContent}
          repoPath={repoPath}
        />
      </Box>
    </DragDropProvider>
  );
}
