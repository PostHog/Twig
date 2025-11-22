import { useTaskExecutionStore } from "@features/task-detail/stores/taskExecutionStore";
import { Box, Checkbox, Flex, Text } from "@radix-ui/themes";
import { useEffect } from "react";

interface TodoListPanelProps {
  taskId: string;
}

export function TodoListPanel({ taskId }: TodoListPanelProps) {
  const taskState = useTaskExecutionStore((state) =>
    state.getTaskState(taskId),
  );
  const checkTodosUpdate = useTaskExecutionStore(
    (state) => state.checkTodosUpdate,
  );

  // Load todos from file on mount and when task changes
  useEffect(() => {
    if (taskState.repoPath) {
      checkTodosUpdate(taskId);
    }
  }, [taskId, taskState.repoPath, checkTodosUpdate]);

  const todos = taskState.todos?.items || [];

  if (todos.length === 0) {
    return (
      <Box height="100%" overflowY="auto" p="4">
        <Text size="2" color="gray">
          No todos yet
        </Text>
      </Box>
    );
  }

  return (
    <Box height="100%" overflowY="auto" p="4">
      <Flex direction="column" gap="3">
        {todos.map((todo, index) => (
          <Flex
            key={`${todo.content}-${index}`}
            align="center"
            gap="2"
            p="1"
            className="cursor-pointer rounded-md hover:bg-gray-2"
          >
            <Checkbox
              checked={todo.status === "completed"}
              style={{ cursor: "pointer" }}
            />
            <Text
              size="1"
              style={{
                textDecoration:
                  todo.status === "completed" ? "line-through" : "none",
                color:
                  todo.status === "completed"
                    ? "var(--gray-9)"
                    : "var(--gray-12)",
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
