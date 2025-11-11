import { CheckIcon } from "@phosphor-icons/react";
import { Box, Checkbox, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";

interface TodoListPanelProps {
  taskId: string;
  task: Task;
}

interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

const DUMMY_TODOS: TodoItem[] = [
  { id: "1", content: "Explore the project", status: "completed" },
  { id: "2", content: "Find the relevant files and components", status: "in_progress" },
  { id: "3", content: "Review existing patterns and constraints", status: "pending" },
  { id: "4", content: "Create the plus button tab feature", status: "pending" },
  { id: "5", content: "Add the plus button tab feature to the codebase", status: "pending" },
  { id: "6", content: "Test the plus button tab feature", status: "pending" },
  { id: "7", content: "Create a pull request for the plus button tab feature", status: "pending" },
];

export function TodoListPanel({ taskId, task }: TodoListPanelProps) {
  return (
    <Box height="100%" overflowY="auto" p="4">
      <Flex direction="column" gap="3">
        {DUMMY_TODOS.map((todo) => (
          <Flex
            key={todo.id}
            align="center"
            gap="2"
            p="1"
            className="rounded-md hover:bg-gray-2 cursor-pointer"
          >
            <Checkbox
              checked={todo.status === "completed"}
              style={{ cursor: "pointer" }}
            />
            <Text
              size="1"
              style={{
                textDecoration: todo.status === "completed" ? "line-through" : "none",
                color: todo.status === "completed" ? "var(--gray-9)" : "var(--gray-12)",
              }}
            >
              {todo.content}
            </Text>
            {todo.status === "in_progress" && (
              <Box ml="auto">
                <Text size="1" color="blue">
                  Working
                </Text>
              </Box>
            )}
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}
