import "reflect-metadata";
import { Container } from "inversify";
import { ContextMenuService } from "../services/context-menu/service.js";
import { DeepLinkService } from "../services/deep-link/service.js";
import { DockBadgeService } from "../services/dock-badge/service.js";
import { ExternalAppsService } from "../services/external-apps/service.js";
import { FileWatcherService } from "../services/file-watcher/service.js";
import { FoldersService } from "../services/folders/service.js";
import { FsService } from "../services/fs/service.js";
import { GitService } from "../services/git/service.js";
import { OAuthService } from "../services/oauth/service.js";
import { ShellService } from "../services/shell/service.js";
import { UpdatesService } from "../services/updates/service.js";
import { MAIN_TOKENS } from "./tokens.js";

export const container = new Container({
  defaultScope: "Singleton",
});

container.bind(MAIN_TOKENS.ContextMenuService).to(ContextMenuService);
container.bind(MAIN_TOKENS.DeepLinkService).to(DeepLinkService);
container.bind(MAIN_TOKENS.DockBadgeService).to(DockBadgeService);
container.bind(MAIN_TOKENS.ExternalAppsService).to(ExternalAppsService);
container.bind(MAIN_TOKENS.FileWatcherService).to(FileWatcherService);
container.bind(MAIN_TOKENS.FoldersService).to(FoldersService);
container.bind(MAIN_TOKENS.FsService).to(FsService);
container.bind(MAIN_TOKENS.GitService).to(GitService);
container.bind(MAIN_TOKENS.OAuthService).to(OAuthService);
container.bind(MAIN_TOKENS.ShellService).to(ShellService);
container.bind(MAIN_TOKENS.UpdatesService).to(UpdatesService);
