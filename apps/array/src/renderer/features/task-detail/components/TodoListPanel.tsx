import { PanelMessage } from "@components/ui/PanelMessage";
import { Box, Checkbox, Flex, Text } from "@radix-ui/themes";

interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

interface TodoListPanelProps {
  taskId: string;
}

export function TodoListPanel({ taskId: _taskId }: TodoListPanelProps) {
  // TODO: Migrate to read todos from sessionStore events
  const todos: TodoItem[] = [];

  if (todos.length === 0) {
    return <PanelMessage>No todos yet</PanelMessage>;
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
