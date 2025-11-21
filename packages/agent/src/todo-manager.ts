import type { PostHogFileManager } from "./file-manager.js";
import { Logger } from "./utils/logger.js";

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}

export interface TodoList {
  items: TodoItem[];
  metadata: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    last_updated: string;
  };
}

export class TodoManager {
  private fileManager: PostHogFileManager;
  private logger: Logger;

  constructor(fileManager: PostHogFileManager, logger?: Logger) {
    this.fileManager = fileManager;
    this.logger =
      logger || new Logger({ debug: false, prefix: "[TodoManager]" });
  }

  async readTodos(taskId: string): Promise<TodoList | null> {
    try {
      const content = await this.fileManager.readTaskFile(taskId, "todos.json");
      if (!content) {
        return null;
      }

      const parsed = JSON.parse(content) as TodoList;
      this.logger.debug("Loaded todos", {
        taskId,
        total: parsed.metadata.total,
        pending: parsed.metadata.pending,
        in_progress: parsed.metadata.in_progress,
        completed: parsed.metadata.completed,
      });

      return parsed;
    } catch (error) {
      this.logger.debug("Failed to read todos.json", {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async writeTodos(taskId: string, todos: TodoList): Promise<void> {
    this.logger.debug("Writing todos", {
      taskId,
      total: todos.metadata.total,
      pending: todos.metadata.pending,
      in_progress: todos.metadata.in_progress,
      completed: todos.metadata.completed,
    });

    await this.fileManager.writeTaskFile(taskId, {
      name: "todos.json",
      content: JSON.stringify(todos, null, 2),
      type: "artifact",
    });

    this.logger.info("Todos saved", {
      taskId,
      total: todos.metadata.total,
      completed: todos.metadata.completed,
    });
  }

  parseTodoWriteInput(toolInput: any): TodoList {
    const items: TodoItem[] = [];

    if (toolInput.todos && Array.isArray(toolInput.todos)) {
      for (const todo of toolInput.todos) {
        items.push({
          content: todo.content || "",
          status: todo.status || "pending",
          activeForm: todo.activeForm || todo.content || "",
        });
      }
    }

    const metadata = this.calculateMetadata(items);

    return { items, metadata };
  }

  private calculateMetadata(items: TodoItem[]): TodoList["metadata"] {
    const total = items.length;
    const pending = items.filter((t) => t.status === "pending").length;
    const in_progress = items.filter((t) => t.status === "in_progress").length;
    const completed = items.filter((t) => t.status === "completed").length;

    return {
      total,
      pending,
      in_progress,
      completed,
      last_updated: new Date().toISOString(),
    };
  }

  async getTodoContext(taskId: string): Promise<string> {
    const todos = await this.readTodos(taskId);
    if (!todos || todos.items.length === 0) {
      return "";
    }

    const lines: string[] = ["## Previous Todo List\n"];
    lines.push("You previously created the following todo list:\n");

    for (const item of todos.items) {
      const statusIcon =
        item.status === "completed"
          ? "✓"
          : item.status === "in_progress"
            ? "▶"
            : "○";
      lines.push(`${statusIcon} [${item.status}] ${item.content}`);
    }

    lines.push(
      `\nProgress: ${todos.metadata.completed}/${todos.metadata.total} completed\n`,
    );

    return lines.join("\n");
  }

  // check for TodoWrite tool call and persist if found
  async checkAndPersistFromMessage(
    message: any,
    taskId: string,
  ): Promise<TodoList | null> {
    if (message.type !== "assistant" || !message.message?.content) {
      return null;
    }

    for (const block of message.message.content) {
      if (block.type === "tool_use" && block.name === "TodoWrite") {
        try {
          this.logger.info("TodoWrite detected, persisting todos", { taskId });

          const todoList = this.parseTodoWriteInput(block.input);
          await this.writeTodos(taskId, todoList);

          this.logger.info("Persisted todos successfully", {
            taskId,
            total: todoList.metadata.total,
            completed: todoList.metadata.completed,
          });

          return todoList;
        } catch (error) {
          this.logger.error("Failed to persist todos", {
            taskId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }
    }

    return null;
  }
}
