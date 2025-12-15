import "reflect-metadata";
import { Container } from "inversify";
import { DeepLinkService } from "../services/deep-link/service.js";
import { GitService } from "../services/git/service.js";
import { OAuthService } from "../services/oauth/service.js";
import { MAIN_TOKENS } from "./tokens.js";

/**
 * Main process dependency injection container
 */
export const container = new Container({
  defaultScope: "Singleton",
});

// Bind services
container.bind<GitService>(MAIN_TOKENS.GitService).to(GitService);
container
  .bind<DeepLinkService>(MAIN_TOKENS.DeepLinkService)
  .to(DeepLinkService);
container.bind<OAuthService>(MAIN_TOKENS.OAuthService).to(OAuthService);

export function get<T>(token: symbol): T {
  return container.get<T>(token);
}
