import { contextMenuRouter } from "./routers/context-menu.js";
import { dockBadgeRouter } from "./routers/dock-badge.js";
import { encryptionRouter } from "./routers/encryption.js";
import { externalAppsRouter } from "./routers/external-apps.js";
import { fileWatcherRouter } from "./routers/file-watcher.js";
import { foldersRouter } from "./routers/folders.js";
import { fsRouter } from "./routers/fs.js";
import { gitRouter } from "./routers/git.js";
import { logsRouter } from "./routers/logs.js";
import { osRouter } from "./routers/os.js";
import { secureStoreRouter } from "./routers/secure-store.js";
import { shellRouter } from "./routers/shell.js";
import { router } from "./trpc.js";

export const trpcRouter = router({
  contextMenu: contextMenuRouter,
  dockBadge: dockBadgeRouter,
  encryption: encryptionRouter,
  externalApps: externalAppsRouter,
  fileWatcher: fileWatcherRouter,
  folders: foldersRouter,
  fs: fsRouter,
  git: gitRouter,
  logs: logsRouter,
  os: osRouter,
  secureStore: secureStoreRouter,
  shell: shellRouter,
});

export type TrpcRouter = typeof trpcRouter;
