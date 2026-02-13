import "reflect-metadata";
import { Container } from "inversify";
import { AgentService } from "../services/agent/service.js";
import { AppLifecycleService } from "../services/app-lifecycle/service.js";
import { ConnectivityService } from "../services/connectivity/service.js";
import { ContextMenuService } from "../services/context-menu/service.js";
import { DeepLinkService } from "../services/deep-link/service.js";

import { ExternalAppsService } from "../services/external-apps/service.js";
import { FileWatcherService } from "../services/file-watcher/service.js";
import { FocusService } from "../services/focus/service.js";
import { FocusSyncService } from "../services/focus/sync-service.js";
import { FoldersService } from "../services/folders/service.js";
import { FsService } from "../services/fs/service.js";
import { GitService } from "../services/git/service.js";
import { LlmGatewayService } from "../services/llm-gateway/service.js";
import { NotificationService } from "../services/notification/service.js";
import { OAuthService } from "../services/oauth/service.js";
import { PosthogPluginService } from "../services/posthog-plugin/service.js";
import { ProcessTrackingService } from "../services/process-tracking/service.js";
import { ShellService } from "../services/shell/service.js";
import { SleepService } from "../services/sleep/service.js";
import { TaskLinkService } from "../services/task-link/service.js";
import { UIService } from "../services/ui/service.js";
import { UpdatesService } from "../services/updates/service.js";
import { WatcherRegistryService } from "../services/watcher-registry/service.js";
import { WorkspaceService } from "../services/workspace/service.js";
import { MAIN_TOKENS } from "./tokens.js";

export const container = new Container({
  defaultScope: "Singleton",
});

container.bind(MAIN_TOKENS.AgentService).to(AgentService);
container.bind(MAIN_TOKENS.AppLifecycleService).to(AppLifecycleService);
container.bind(MAIN_TOKENS.ConnectivityService).to(ConnectivityService);
container.bind(MAIN_TOKENS.ContextMenuService).to(ContextMenuService);
container.bind(MAIN_TOKENS.DeepLinkService).to(DeepLinkService);

container.bind(MAIN_TOKENS.ExternalAppsService).to(ExternalAppsService);
container.bind(MAIN_TOKENS.LlmGatewayService).to(LlmGatewayService);
container.bind(MAIN_TOKENS.FileWatcherService).to(FileWatcherService);
container.bind(MAIN_TOKENS.FocusService).to(FocusService);
container.bind(MAIN_TOKENS.FocusSyncService).to(FocusSyncService);
container.bind(MAIN_TOKENS.FoldersService).to(FoldersService);
container.bind(MAIN_TOKENS.FsService).to(FsService);
container.bind(MAIN_TOKENS.GitService).to(GitService);
container.bind(MAIN_TOKENS.NotificationService).to(NotificationService);
container.bind(MAIN_TOKENS.OAuthService).to(OAuthService);
container.bind(MAIN_TOKENS.ProcessTrackingService).to(ProcessTrackingService);
container.bind(MAIN_TOKENS.PosthogPluginService).to(PosthogPluginService);
container.bind(MAIN_TOKENS.SleepService).to(SleepService);
container.bind(MAIN_TOKENS.ShellService).to(ShellService);
container.bind(MAIN_TOKENS.UIService).to(UIService);
container.bind(MAIN_TOKENS.UpdatesService).to(UpdatesService);
container.bind(MAIN_TOKENS.TaskLinkService).to(TaskLinkService);
container.bind(MAIN_TOKENS.WatcherRegistryService).to(WatcherRegistryService);
container.bind(MAIN_TOKENS.WorkspaceService).to(WorkspaceService);
