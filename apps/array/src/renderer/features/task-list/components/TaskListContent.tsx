import { TaskGroup } from "@features/task-list/components/TaskGroup";
import { TaskListItems } from "@features/task-list/components/TaskListItems";
import type { GroupByField } from "@features/tasks/stores/taskStore";
import { Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";

interface TaskListContentProps {
  filteredTasks: Task[];
  groupedTasks: {
    groups: Array<{ name: string; tasks: Task[] }>;
    taskToGlobalIndex: Map<string, number>;
  } | null;
  groupBy: GroupByField;
  expandedGroups: Record<string, boolean>;
  toggleGroupExpanded: (groupName: string) => void;
  selectedIndex: number | null;
  hoveredIndex: number | null;
  contextMenuIndex: number | null;
  onSelectTask: (task: Task) => void;
  filter: string;
}

export function TaskListContent({
  filteredTasks,
  groupedTasks,
  expandedGroups,
  toggleGroupExpanded,
  selectedIndex,
  hoveredIndex,
  contextMenuIndex,
  onSelectTask,
  filter,
}: TaskListContentProps) {
  if (filteredTasks.length === 0) {
    return (
      <Flex align="center" justify="center" height="100%">
        <Text color="gray">
          {filter ? "No tasks match your filter" : "No tasks found"}
        </Text>
      </Flex>
    );
  }

  if (groupedTasks) {
    return (
      <>
        {groupedTasks.groups.map((group) => {
          const isExpanded = expandedGroups[group.name] ?? true;
          return (
            <TaskGroup
              key={group.name}
              name={group.name}
              tasks={group.tasks}
              isExpanded={isExpanded}
              onToggle={() => toggleGroupExpanded(group.name)}
              selectedIndex={selectedIndex}
              hoveredIndex={hoveredIndex}
              contextMenuIndex={contextMenuIndex}
              onSelectTask={onSelectTask}
              taskToGlobalIndex={groupedTasks.taskToGlobalIndex}
            />
          );
        })}
      </>
    );
  }

  return (
    <TaskListItems
      tasks={filteredTasks}
      selectedIndex={selectedIndex}
      hoveredIndex={hoveredIndex}
      contextMenuIndex={contextMenuIndex}
      onSelectTask={onSelectTask}
    />
  );
}
