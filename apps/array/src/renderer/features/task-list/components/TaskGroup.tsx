import { TaskListItems } from "@features/task-list/components/TaskListItems";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Box, Code, Flex } from "@radix-ui/themes";
import type { Task } from "@shared/types";

interface TaskGroupProps {
  name: string;
  tasks: Task[];
  isExpanded: boolean;
  onToggle: () => void;
  selectedIndex: number | null;
  hoveredIndex: number | null;
  contextMenuIndex: number | null;
  onSelectTask: (task: Task) => void;
  taskToGlobalIndex: Map<string, number>;
}

export function TaskGroup({
  name,
  tasks,
  isExpanded,
  onToggle,
  selectedIndex,
  hoveredIndex,
  contextMenuIndex,
  onSelectTask,
  taskToGlobalIndex,
}: TaskGroupProps) {
  return (
    <Collapsible.Root open={isExpanded} onOpenChange={onToggle}>
      <Collapsible.Trigger asChild>
        <Box
          p="2"
          style={{
            cursor: "pointer",
            borderBottom: "1px solid var(--gray-6)",
          }}
          className="bg-gray-2 hover:bg-[var(--gray-4)]"
        >
          <Flex align="center" gap="2">
            {isExpanded ? (
              <CaretDownIcon size={14} />
            ) : (
              <CaretRightIcon size={14} />
            )}
            <Code
              size="1"
              weight="medium"
              variant="ghost"
              style={{ textTransform: "uppercase" }}
            >
              {name}
            </Code>
            <Code size="1" color="gray" variant="ghost">
              ({tasks.length})
            </Code>
          </Flex>
        </Box>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <TaskListItems
          tasks={tasks}
          selectedIndex={selectedIndex}
          hoveredIndex={hoveredIndex}
          contextMenuIndex={contextMenuIndex}
          onSelectTask={onSelectTask}
          taskToGlobalIndex={taskToGlobalIndex}
        />
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
