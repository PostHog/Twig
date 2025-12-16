import { contextMenuRouter } from "./routers/context-menu.js";
import { dockBadgeRouter } from "./routers/dock-badge.js";
import { encryptionRouter } from "./routers/encryption.js";
import { externalAppsRouter } from "./routers/external-apps.js";
import { fsRouter } from "./routers/fs.js";
import { gitRouter } from "./routers/git.js";
import { logsRouter } from "./routers/logs.js";
import { osRouter } from "./routers/os.js";
import { secureStoreRouter } from "./routers/secure-store.js";
import { router } from "./trpc.js";

export const trpcRouter = router({
  contextMenu: contextMenuRouter,
  dockBadge: dockBadgeRouter,
  encryption: encryptionRouter,
  externalApps: externalAppsRouter,
  fs: fsRouter,
  git: gitRouter,
  logs: logsRouter,
  os: osRouter,
  secureStore: secureStoreRouter,
});

export type TrpcRouter = typeof trpcRouter;
