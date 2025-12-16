import { contextMenuRouter } from "./routers/context-menu.js";
import { encryptionRouter } from "./routers/encryption.js";
import { gitRouter } from "./routers/git.js";
import { logsRouter } from "./routers/logs.js";
import { osRouter } from "./routers/os.js";
import { secureStoreRouter } from "./routers/secure-store.js";
import { router } from "./trpc.js";

export const trpcRouter = router({
  os: osRouter,
  logs: logsRouter,
  secureStore: secureStoreRouter,
  encryption: encryptionRouter,
  git: gitRouter,
  contextMenu: contextMenuRouter,
});

export type TrpcRouter = typeof trpcRouter;
