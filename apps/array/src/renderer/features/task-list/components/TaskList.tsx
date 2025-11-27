import { useAuthStore } from "@features/auth/stores/authStore";
import { TaskFilterClearButton } from "@features/task-list/components/TaskFilterClearButton";
import { TaskFilterMatchToggle } from "@features/task-list/components/TaskFilterMatchToggle";
import { TaskListContent } from "@features/task-list/components/TaskListContent";
import { TaskListDisplayOptions } from "@features/task-list/components/TaskListDisplayOptions";
import { TaskListFilter } from "@features/task-list/components/TaskListFilter";
import { TaskSearch } from "@features/task-list/components/TaskSearch";
import { useTaskDragDrop } from "@features/task-list/hooks/useTaskDragDrop";
import { useTaskGrouping } from "@features/task-list/hooks/useTaskGrouping";
import { useTaskKeyboardNavigation } from "@features/task-list/hooks/useTaskKeyboardNavigation";
import { useTaskScrolling } from "@features/task-list/hooks/useTaskScrolling";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { filterTasks, useTaskStore } from "@features/tasks/stores/taskStore";
import { useMeQuery } from "@hooks/useMeQuery";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { useStatusBar } from "@hooks/useStatusBar";
import { getUserDisplayName, useUsers } from "@hooks/useUsers";
import { Box, Button, Flex, Separator, Spinner, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useCallback, useMemo, useRef } from "react";

interface TaskListProps {
  onSelectTask: (task: Task) => void;
}

export function TaskList({ onSelectTask }: TaskListProps) {
  // Data fetching
  const { data: tasks = [], isLoading, error, refetch } = useTasks();
  const { data: users = [] } = useUsers();
  const { data: currentUser } = useMeQuery();

  // Store state
  const filter = useTaskStore((state) => state.filter);
  const selectedIndex = useTaskStore((state) => state.selectedIndex);
  const hoveredIndex = useTaskStore((state) => state.hoveredIndex);
  const contextMenuIndex = useTaskStore((state) => state.contextMenuIndex);
  const orderBy = useTaskStore((state) => state.orderBy);
  const orderDirection = useTaskStore((state) => state.orderDirection);
  const groupBy = useTaskStore((state) => state.groupBy);
  const expandedGroups = useTaskStore((state) => state.expandedGroups);
  const activeFilters = useTaskStore((state) => state.activeFilters);
  const filterMatchMode = useTaskStore((state) => state.filterMatchMode);

  // Store actions
  const moveTask = useTaskStore((state) => state.moveTask);
  const setSelectedIndex = useTaskStore((state) => state.setSelectedIndex);
  const setHoveredIndex = useTaskStore((state) => state.setHoveredIndex);
  const setFilter = useTaskStore((state) => state.setFilter);
  const toggleGroupExpanded = useTaskStore(
    (state) => state.toggleGroupExpanded,
  );

  const { logout } = useAuthStore();
  const listRef = useRef<HTMLDivElement>(null);

  const filteredTasks = filterTasks(
    tasks,
    orderBy,
    orderDirection,
    filter,
    activeFilters,
    filterMatchMode,
  );
  const groupedTasks = useTaskGrouping(filteredTasks, groupBy, users);

  const handleMoveTask = useCallback(
    (fromIndex: number, toIndex: number) => {
      const taskId = filteredTasks[fromIndex].id;
      moveTask(taskId, fromIndex, toIndex, filteredTasks);
    },
    [filteredTasks, moveTask],
  );

  const {
    draggedTaskId,
    dragOverIndex,
    dropPosition,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  } = useTaskDragDrop(filteredTasks, moveTask);

  useTaskKeyboardNavigation(
    filteredTasks,
    selectedIndex,
    hoveredIndex,
    contextMenuIndex,
    setSelectedIndex,
    setHoveredIndex,
    onSelectTask,
    refetch,
  );

  useTaskScrolling(listRef, selectedIndex, filteredTasks.length);

  // Determine view title
  const viewTitle = useMemo(() => {
    const creatorFilters = activeFilters.creator || [];
    const repositoryFilters = activeFilters.repository || [];

    // Check for "My tasks" view
    if (creatorFilters.length === 1 && currentUser) {
      const userDisplayName = getUserDisplayName(currentUser);
      if (creatorFilters[0].value === userDisplayName) {
        return "My tasks";
      }
    }

    // Check for project/repository view
    if (repositoryFilters.length === 1) {
      const repoPath = repositoryFilters[0].value;
      const repoName = repoPath.split("/").pop() || repoPath;
      return repoName;
    }

    return "All tasks";
  }, [activeFilters, currentUser]);

  const totalActiveFilterCount = Object.values(activeFilters).reduce(
    (sum, filters) => sum + (filters?.length || 0),
    0,
  );

  const headerContent = useMemo(
    () => (
      <Text size="2" weight="medium">
        {viewTitle}
      </Text>
    ),
    [viewTitle],
  );

  useSetHeaderContent(headerContent);

  // Status bar
  useStatusBar(
    `${filteredTasks.length} task${filteredTasks.length === 1 ? "" : "s"}`,
    [
      {
        keys: [navigator.platform.includes("Mac") ? "⌘" : "Ctrl", "K"],
        description: "Command",
      },
      {
        keys: [navigator.platform.includes("Mac") ? "⌘" : "Ctrl", "R"],
        description: "Refresh",
      },
      {
        keys: ["↑", "↓"],
        description: "Navigate",
      },
      {
        keys: ["Enter"],
        description: "Select",
      },
    ],
    "replace",
  );

  // Loading state
  if (isLoading && tasks.length === 0) {
    return (
      <Box height="100%" p="6">
        <Flex align="center" justify="center" height="100%">
          <Flex align="center" gap="3">
            <Spinner size="3" />
            <Text color="gray">Loading tasks...</Text>
          </Flex>
        </Flex>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box height="100%" p="6">
        <Flex
          direction="column"
          align="center"
          justify="center"
          height="100%"
          gap="4"
        >
          <Text color="red">
            {error instanceof Error ? error.message : "Failed to load tasks"}
          </Text>
          <Flex gap="2">
            <Button onClick={() => refetch()}>Retry</Button>
            <Button variant="outline" onClick={logout}>
              Logout
            </Button>
          </Flex>
        </Flex>
      </Box>
    );
  }

  return (
    <Flex direction="column" height="100%">
      <Box pl="2" pb="2" pt="2" className="border-gray-6 border-b">
        <Flex gap="2" align="start" justify="between">
          <Flex align="center" gap="2">
            <TaskListFilter />
            {totalActiveFilterCount > 0 && (
              <Flex gap="2" className="flex-shrink-0">
                <TaskFilterMatchToggle />
                {totalActiveFilterCount > 1 && (
                  <Separator orientation="vertical" />
                )}
                <TaskFilterClearButton />
              </Flex>
            )}
          </Flex>
          <Flex align="center" gap="2">
            <TaskListDisplayOptions />
            <TaskSearch
              value={filter}
              onChange={(newFilter) => {
                setFilter(newFilter);
                setSelectedIndex(null);
              }}
            />
          </Flex>
        </Flex>
      </Box>

      <Box ref={listRef} flexGrow="1" overflowY="auto">
        <TaskListContent
          filteredTasks={filteredTasks}
          groupedTasks={groupedTasks}
          groupBy={groupBy}
          expandedGroups={expandedGroups}
          toggleGroupExpanded={toggleGroupExpanded}
          draggedTaskId={draggedTaskId}
          dragOverIndex={dragOverIndex}
          dropPosition={dropPosition}
          selectedIndex={selectedIndex}
          hoveredIndex={hoveredIndex}
          contextMenuIndex={contextMenuIndex}
          onSelectTask={onSelectTask}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          onMoveTask={handleMoveTask}
          filter={filter}
        />
      </Box>
    </Flex>
  );
}
