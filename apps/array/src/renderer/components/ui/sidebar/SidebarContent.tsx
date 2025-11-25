import { RenameTaskDialog } from "@components/RenameTaskDialog";
import { SidebarTreeItem } from "@components/ui/sidebar/SidebarTreeItem";
import { useSidebarMenuData } from "@components/ui/sidebar/UseSidebarMenuData";
import { buildTreeLines, getAllNodeIds } from "@components/ui/sidebar/utils";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { useMeQuery } from "@hooks/useMeQuery";
import { useTaskContextMenu } from "@hooks/useTaskContextMenu";
import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Tooltip } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import type { Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useSidebarStore } from "@stores/sidebarStore";
import type React from "react";
import { useEffect, useRef, useState } from "react";

export const SidebarContent: React.FC = () => {
  const {
    view,
    navigateToTaskList,
    navigateToTask,
    navigateToTaskInput,
    navigateToSettings,
  } = useNavigationStore();
  const expandedNodesArray = useSidebarStore((state) => state.expandedNodes);
  const { toggleNode, expandAll, collapseAll } = useSidebarStore();
  const { isLoading } = useTasks();
  const activeFilters = useTaskStore((state) => state.activeFilters);
  const setActiveFilters = useTaskStore((state) => state.setActiveFilters);
  const { data: currentUser } = useMeQuery();
  const { folders, removeFolder } = useRegisteredFoldersStore();
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);
  const { showContextMenu, renameTask, renameDialogOpen, setRenameDialogOpen } =
    useTaskContextMenu();
  const seenFoldersRef = useRef<Set<string>>(new Set());

  const expandedNodes = new Set(expandedNodesArray);
  const userName = currentUser?.first_name || currentUser?.email || "Account";

  const handleNavigate = (type: "task-list" | "settings", _title: string) => {
    if (type === "task-list") {
      navigateToTaskList();
    } else {
      navigateToSettings();
    }
  };

  const handleTaskClick = (task: Task) => {
    navigateToTask(task);
  };

  const handleProjectClick = (repository: string) => {
    const newActiveFilters = { ...activeFilters };
    newActiveFilters.repository = [{ value: repository, operator: "is" }];
    setActiveFilters(newActiveFilters);
    handleNavigate("task-list", "Tasks");
  };

  const handleFolderNewTask = (folderId: string) => {
    navigateToTaskInput(folderId);
  };

  const handleFolderContextMenu = async (
    folderId: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    const folder = folders.find((f) => f.id === folderId);
    if (!folder) return;

    if (!window.electronAPI?.showFolderContextMenu) {
      const confirmed = window.confirm(
        `Remove "${folder.name}" from Array?\n\nThis will not delete any files on your computer.`,
      );
      if (confirmed) {
        await removeFolder(folderId);
      }
      return;
    }

    const result = await window.electronAPI.showFolderContextMenu(
      folderId,
      folder.name,
    );

    if (result.action === "remove") {
      await removeFolder(folderId);
    }
  };

  const menuNodes = useSidebarMenuData({
    userName,
    activeView: view,
    isLoading,
    activeFilters,
    currentUser,
    setActiveFilters,
    onNavigate: handleNavigate,
    onHomeClick: () => navigateToTaskInput(),
    onTaskClick: handleTaskClick,
    onProjectClick: handleProjectClick,
    onTaskContextMenu: showContextMenu,
    onFolderNewTask: handleFolderNewTask,
    onFolderContextMenu: handleFolderContextMenu,
  });

  const treeLines = buildTreeLines(menuNodes, "", "", expandedNodes, 0);
  const allNodeIds = getAllNodeIds(menuNodes, "", 0);
  const allExpanded =
    allNodeIds.length > 0 && allNodeIds.every((id) => expandedNodes.has(id));

  useEffect(() => {
    const folderNodeIds = menuNodes
      .filter((node) => !node.isRootHeader && node.id)
      .map((node) => node.id as string);

    const newFolders = folderNodeIds.filter(
      (id) => !seenFoldersRef.current.has(id) && !expandedNodes.has(id),
    );

    if (newFolders.length > 0) {
      for (const folderId of newFolders) {
        seenFoldersRef.current.add(folderId);
        toggleNode(folderId);
      }
    }
  }, [menuNodes, expandedNodes, toggleNode]);

  const handleToggleExpandAll = () => {
    if (allExpanded) {
      collapseAll();
    } else {
      expandAll(allNodeIds);
    }
  };

  return (
    <>
      <RenameTaskDialog
        task={renameTask}
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
      />

      <Box
        style={{
          flexGrow: 1,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <Flex direction="column" gap="4" p="2">
          <div className="sidebar-tree">
            {treeLines.map((line, index) => {
              if (line.isRootHeader) {
                return (
                  <Flex
                    key={line.nodeId}
                    align="center"
                    justify="between"
                    mb="1"
                    mt={index === 0 ? "0" : "4"}
                  >
                    <span style={{ fontWeight: 500 }}>{line.label}</span>
                    {false && (
                      <Tooltip
                        content={allExpanded ? "Collapse all" : "Expand all"}
                      >
                        <IconButton
                          size="1"
                          variant="ghost"
                          color="gray"
                          onClick={handleToggleExpandAll}
                          style={{ cursor: "pointer" }}
                        >
                          {allExpanded ? (
                            <ArrowsInSimpleIcon size={12} />
                          ) : (
                            <ArrowsOutSimpleIcon size={12} />
                          )}
                        </IconButton>
                      </Tooltip>
                    )}
                  </Flex>
                );
              }
              return (
                <SidebarTreeItem
                  key={line.nodeId}
                  line={line}
                  index={index}
                  isHovered={hoveredLineIndex === index}
                  expandedNodes={expandedNodes}
                  onMouseEnter={() => setHoveredLineIndex(index)}
                  onMouseLeave={() => setHoveredLineIndex(null)}
                  onToggle={toggleNode}
                />
              );
            })}
          </div>
        </Flex>
      </Box>
    </>
  );
};
