import { TaskFilterClearButton } from "@features/task-list/components/TaskFilterClearButton";
import { TaskFilterMatchToggle } from "@features/task-list/components/TaskFilterMatchToggle";
import { TaskListDisplayOptions } from "@features/task-list/components/TaskListDisplayOptions";
import { TaskListFilter } from "@features/task-list/components/TaskListFilter";
import { TaskSearch } from "@features/task-list/components/TaskSearch";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { Box, Flex, Separator } from "@radix-ui/themes";

interface TaskListHeaderProps {
  filter: string;
  onFilterChange: (filter: string) => void;
}

export function TaskListHeader({
  filter,
  onFilterChange,
}: TaskListHeaderProps) {
  const activeFilters = useTaskStore((state) => state.activeFilters);
  const totalActiveFilterCount = Object.values(activeFilters).reduce(
    (sum, filters) => sum + (filters?.length || 0),
    0,
  );

  return (
    <Box pl="2" py="4" className="border-gray-6 border-b">
      <Flex gap="2" align="start" justify="between">
        <Flex align="center" justify="center" gap="2">
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
        <Flex align="center" justify="center" gap="2">
          <TaskListDisplayOptions />
          <TaskSearch value={filter} onChange={onFilterChange} />
        </Flex>
      </Flex>
    </Box>
  );
}
