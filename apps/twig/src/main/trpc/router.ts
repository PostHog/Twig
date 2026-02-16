import { agentRouter } from "./routers/agent.js";
import { analyticsRouter } from "./routers/analytics.js";
import { connectivityRouter } from "./routers/connectivity.js";
import { contextMenuRouter } from "./routers/context-menu.js";
import { deepLinkRouter } from "./routers/deep-link.js";

import { encryptionRouter } from "./routers/encryption.js";
import { externalAppsRouter } from "./routers/external-apps.js";
import { fileWatcherRouter } from "./routers/file-watcher.js";
import { focusRouter } from "./routers/focus.js";
import { foldersRouter } from "./routers/folders.js";
import { fsRouter } from "./routers/fs.js";
import { gitRouter } from "./routers/git.js";
import { llmGatewayRouter } from "./routers/llm-gateway.js";
import { logsRouter } from "./routers/logs.js";
import { notificationRouter } from "./routers/notification.js";
import { oauthRouter } from "./routers/oauth.js";
import { osRouter } from "./routers/os.js";
import { processTrackingRouter } from "./routers/process-tracking.js";
import { secureStoreRouter } from "./routers/secure-store.js";
import { shellRouter } from "./routers/shell.js";
import { sleepRouter } from "./routers/sleep.js";
import { uiRouter } from "./routers/ui.js";
import { updatesRouter } from "./routers/updates.js";
import { workspaceRouter } from "./routers/workspace.js";
import { router } from "./trpc.js";

export const trpcRouter = router({
  agent: agentRouter,
  analytics: analyticsRouter,
  connectivity: connectivityRouter,
  contextMenu: contextMenuRouter,

  encryption: encryptionRouter,
  externalApps: externalAppsRouter,
  fileWatcher: fileWatcherRouter,
  focus: focusRouter,
  folders: foldersRouter,
  fs: fsRouter,
  git: gitRouter,
  llmGateway: llmGatewayRouter,
  notification: notificationRouter,
  oauth: oauthRouter,
  logs: logsRouter,
  os: osRouter,
  processTracking: processTrackingRouter,
  sleep: sleepRouter,
  secureStore: secureStoreRouter,
  shell: shellRouter,
  ui: uiRouter,
  updates: updatesRouter,
  deepLink: deepLinkRouter,
  workspace: workspaceRouter,
});

export type TrpcRouter = typeof trpcRouter;
