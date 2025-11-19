import { RenameTaskDialog } from "@components/RenameTaskDialog";
import { SidebarTreeItem } from "@components/ui/sidebar/SidebarTreeItem";
import { useSidebarMenuData } from "@components/ui/sidebar/UseSidebarMenuData";
import { buildTreeLines, getAllNodeIds } from "@components/ui/sidebar/Utils";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { useMeQuery } from "@hooks/useMeQuery";
import { useTaskContextMenu } from "@hooks/useTaskContextMenu";
import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import { Box, Button, Flex, IconButton, Tooltip } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useLayoutStore } from "@stores/layoutStore";
import { useNavigationStore } from "@stores/navigationStore";
import { useSidebarStore } from "@stores/sidebarStore";
import type React from "react";
import { useState } from "react";

export const SidebarContent: React.FC = () => {
  const { view, navigateToTaskList, navigateToTask, navigateToSettings } =
    useNavigationStore();
  const expandedNodesArray = useSidebarStore((state) => state.expandedNodes);
  const { toggleNode, expandAll, collapseAll } = useSidebarStore();
  const { setCliMode } = useLayoutStore();
  const { isLoading } = useTasks();
  const activeFilters = useTaskStore((state) => state.activeFilters);
  const setActiveFilters = useTaskStore((state) => state.setActiveFilters);
  const { data: currentUser } = useMeQuery();
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);
  const { showContextMenu, renameTask, renameDialogOpen, setRenameDialogOpen } =
    useTaskContextMenu();

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

  const handleCreateTask = () => {
    navigateToTaskList();
    setCliMode("task");
  };

  const handleProjectClick = (repository: string) => {
    const newActiveFilters = { ...activeFilters };
    newActiveFilters.repository = [{ value: repository, operator: "is" }];
    setActiveFilters(newActiveFilters);
    handleNavigate("task-list", "Tasks");
  };

  const menuNodes = useSidebarMenuData({
    userName,
    activeView: view,
    isLoading,
    activeFilters,
    currentUser,
    setActiveFilters,
    onNavigate: handleNavigate,
    onTaskClick: handleTaskClick,
    onProjectClick: handleProjectClick,
    onTaskContextMenu: showContextMenu,
  });

  const treeLines = buildTreeLines(menuNodes, "", "", expandedNodes, 0);
  const allNodeIds = getAllNodeIds(menuNodes, "", 0);
  const allExpanded =
    allNodeIds.length > 0 && allNodeIds.every((id) => expandedNodes.has(id));

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
          overflow: "auto",
        }}
      >
        <Flex direction="column" gap="4" p="2">
          <Button
            variant="outline"
            size="1"
            onClick={handleCreateTask}
            style={{ width: "100%" }}
          >
            New task
          </Button>
          <div className="sidebar-tree">
            {treeLines.map((line, index) => {
              const isRoot = line.prefix === "" && line.connector === "";
              if (isRoot) {
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
