import "reflect-metadata";
import { Container } from "inversify";
import { GitService } from "../services/git/service.js";
import { MAIN_TOKENS } from "./tokens.js";

/**
 * Main process dependency injection container
 */
export const container = new Container({
  defaultScope: "Singleton",
});

// Bind services
container.bind<GitService>(MAIN_TOKENS.GitService).to(GitService);

export function get<T>(token: symbol): T {
  return container.get<T>(token);
}
