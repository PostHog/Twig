import "reflect-metadata";
import { TaskService } from "@renderer/services/task.service";
import { Container } from "inversify";
import { TOKENS } from "./tokens";

/**
 * Renderer process dependency injection container
 */
export const container = new Container({
  defaultScope: "Singleton",
});

// Bind services
container.bind<TaskService>(TOKENS.TaskService).to(TaskService);

export function get<T>(token: symbol): T {
  return container.get<T>(token);
}
