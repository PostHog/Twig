import "reflect-metadata";
import type { TrpcRouter } from "@main/trpc/router.js";
import { trpcVanilla } from "@renderer/trpc";
import type { TRPCClient } from "@trpc/client";
import { Container } from "inversify";
import { TaskService } from "../services/task/service";
import { RENDERER_TOKENS } from "./tokens";

/**
 * Renderer process dependency injection container
 */
export const container = new Container({
  defaultScope: "Singleton",
});

// Bind infrastructure
container
  .bind<TRPCClient<TrpcRouter>>(RENDERER_TOKENS.TRPCClient)
  .toConstantValue(trpcVanilla);

// Bind services
container.bind<TaskService>(RENDERER_TOKENS.TaskService).to(TaskService);

export function get<T>(token: symbol): T {
  return container.get<T>(token);
}
