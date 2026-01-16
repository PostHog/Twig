import { type FileDragHandlers, PanelLayout } from "@features/panels";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import type { Tab } from "@features/panels/store/panelTypes";
import { useFileWatcher } from "@hooks/useFileWatcher";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { ArrowsMerge, Folder, GitBranch } from "@phosphor-icons/react";
import { Box, Button, Flex, Text, Tooltip } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc";
import { basename } from "@renderer/utils/path";
import { toast } from "@renderer/utils/toast";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useDashboardActions,
  useDashboardStore,
} from "../stores/dashboardStore";
import { createDashboardPanelTree } from "../utils/createDashboardPanelTree";
import { DashboardTabContentRenderer } from "./DashboardTabContentRenderer";

export function RepoDashboard() {
  const { view } = useNavigationStore();
  const repoPath = view.type === "repo-dashboard" ? view.repoPath : undefined;

  // Watch for file changes to update diff previews
  useFileWatcher(repoPath ?? null);

  const { moveFiles } = useDashboardActions(repoPath);
  const setDraggingFiles = useDashboardStore((s) => s.setDraggingFiles);
  const clearDragState = useDashboardStore((s) => s.clearDragState);

  const layoutId = repoPath ? `dashboard-${repoPath}` : "";
  const layout = usePanelLayoutStore((state) => state.getLayout(layoutId));
  const initializeCustomLayout = usePanelLayoutStore(
    (state) => state.initializeCustomLayout,
  );

  const repoName = repoPath ? basename(repoPath) : "Repository";

  // Repo mode (jj vs git) with optimistic updates
  const { data: repoMode } = trpcReact.arr.repoMode.useQuery(
    { cwd: repoPath ?? "" },
    {
      enabled: !!repoPath,
      staleTime: 1000,
      refetchInterval: 5000,
    },
  );

  // Optimistic state - null means use server state
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(
    null,
  );

  const serverEnabled = repoMode?.mode === "jj";

  // Clear optimistic state when server catches up
  useEffect(() => {
    if (optimisticEnabled !== null && serverEnabled === optimisticEnabled) {
      setOptimisticEnabled(null);
    }
  }, [serverEnabled, optimisticEnabled]);

  const isWorkspacesEnabled = optimisticEnabled ?? serverEnabled ?? false;

  const utils = trpcReact.useUtils();
  const enterMutation = trpcReact.arr.enter.useMutation({
    onSuccess: () => {
      toast.success("Workspaces enabled");
      if (repoPath) {
        utils.arr.repoMode.invalidate({ cwd: repoPath });
        utils.arr.focusStatus.invalidate({ cwd: repoPath });
        utils.arr.workspaceStatus.invalidate({ cwd: repoPath });
        utils.arr.listUnassigned.invalidate({ cwd: repoPath });
      }
      // Don't clear optimistic state here - let useEffect do it when server catches up
    },
    onError: (error) => {
      toast.error("Failed to enable workspaces", {
        description: error.message,
      });
      setOptimisticEnabled(null); // Rollback on error
    },
  });

  // focusOnly mutation for ensuring single selection when switching to git mode
  const focusOnlyMutation = trpcReact.arr.focusOnly.useMutation();

  const exitMutation = trpcReact.arr.exit.useMutation({
    onSuccess: async () => {
      toast.success("Workspaces disabled");
      if (repoPath) {
        // When switching to git mode, ensure only one workspace is focused
        // Get current focus status and pick the first focused workspace
        const focusData = utils.arr.focusStatus.getData({ cwd: repoPath });
        if (focusData && focusData.workspaces.length > 1) {
          // Focus only the first one
          await focusOnlyMutation.mutateAsync({
            name: focusData.workspaces[0],
            cwd: repoPath,
          });
        }
        utils.arr.repoMode.invalidate({ cwd: repoPath });
        utils.arr.focusStatus.invalidate({ cwd: repoPath });
      }
      // Don't clear optimistic state here - let useEffect do it when server catches up
    },
    onError: (error) => {
      toast.error("Failed to disable workspaces", {
        description: error.message,
      });
      setOptimisticEnabled(null);
    },
  });

  const handleToggleWorkspaces = useCallback(
    (checked: boolean) => {
      if (!repoPath) return;
      setOptimisticEnabled(checked); // Optimistic update
      if (checked) {
        enterMutation.mutate({ cwd: repoPath });
      } else {
        exitMutation.mutate({ cwd: repoPath });
      }
    },
    [repoPath, enterMutation, exitMutation],
  );

  const headerContent = useMemo(
    () => (
      <Flex align="center" gap="3" justify="center">
        <Folder size={16} />
        <Text size="2" weight="medium">
          {repoName}
        </Text>
        <Tooltip
          content={
            isWorkspacesEnabled
              ? "Click to disable workspaces"
              : "Workspaces disabled. Click to enable"
          }
        >
          <Button
            size="1"
            variant="soft"
            color={isWorkspacesEnabled ? undefined : "gray"}
            onClick={() => handleToggleWorkspaces(!isWorkspacesEnabled)}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {isWorkspacesEnabled ? (
              <ArrowsMerge size={14} />
            ) : (
              <GitBranch size={14} />
            )}
            {isWorkspacesEnabled ? "Workspaces" : "Git"}
          </Button>
        </Tooltip>
      </Flex>
    ),
    [repoName, isWorkspacesEnabled, handleToggleWorkspaces],
  );

  useSetHeaderContent(headerContent);

  // Initialize dashboard layout if not exists
  useEffect(() => {
    if (repoPath && !layout) {
      initializeCustomLayout(layoutId, createDashboardPanelTree(repoPath));
    }
  }, [repoPath, layout, layoutId, initializeCustomLayout]);

  // File drag-drop handlers
  const fileDragHandlers: FileDragHandlers = useMemo(
    () => ({
      onFileDragStart: (file) => {
        setDraggingFiles([file]);
      },
      onFileDrop: async (file, fromWorkspace, toWorkspace) => {
        await moveFiles([file], fromWorkspace, toWorkspace);
      },
      onFileDragCancel: () => {
        clearDragState();
      },
    }),
    [setDraggingFiles, moveFiles, clearDragState],
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
    <Box height="100%">
      <PanelLayout
        layoutId={layoutId}
        renderContent={renderContent}
        repoPath={repoPath}
        fileDragHandlers={fileDragHandlers}
      />
    </Box>
  );
}
