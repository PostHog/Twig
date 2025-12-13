import "reflect-metadata";
import { Container } from "inversify";
import { TaskService } from "../services/task.service.js";
import { TOKENS } from "./tokens.js";

/**
 * Main process dependency injection container
 */
export const container = new Container({
  defaultScope: "Singleton",
});

// Bind services
container.bind<TaskService>(TOKENS.TaskService).to(TaskService);

export function get<T>(token: symbol): T {
  return container.get<T>(token);
}
