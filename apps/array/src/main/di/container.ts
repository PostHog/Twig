import "reflect-metadata";
import { Container } from "inversify";
import { ContextMenuService } from "../services/context-menu/service.js";
import { ExternalAppsService } from "../services/external-apps/service.js";
import { GitService } from "../services/git/service.js";
import { MAIN_TOKENS } from "./tokens.js";

export const container = new Container({
  defaultScope: "Singleton",
});

container.bind(MAIN_TOKENS.ExternalAppsService).to(ExternalAppsService);
container.bind(MAIN_TOKENS.GitService).to(GitService);
container.bind(MAIN_TOKENS.ContextMenuService).to(ContextMenuService);
