import { TaskItem } from "@features/task-list/components/TaskItem";
import type { Task } from "@shared/types";

interface TaskListItemsProps {
  tasks: Task[];
  selectedIndex: number | null;
  hoveredIndex: number | null;
  contextMenuIndex: number | null;
  onSelectTask: (task: Task) => void;
  taskToGlobalIndex?: Map<string, number>;
}

export function TaskListItems({
  tasks,
  selectedIndex,
  hoveredIndex,
  contextMenuIndex,
  onSelectTask,
  taskToGlobalIndex,
}: TaskListItemsProps) {
  return (
    <>
      {tasks.map((task, localIndex) => {
        const globalIndex = taskToGlobalIndex?.get(task.id) ?? localIndex;

        return (
          <TaskItem
            key={task.id}
            task={task}
            index={globalIndex}
            isHighlighted={
              globalIndex === selectedIndex ||
              globalIndex === hoveredIndex ||
              globalIndex === contextMenuIndex
            }
            onSelectTask={onSelectTask}
          />
        );
      })}
    </>
  );
}
