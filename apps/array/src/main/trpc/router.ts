import { encryptionRouter } from "./routers/encryption.js";
import { logsRouter } from "./routers/logs.js";
import { osRouter } from "./routers/os.js";
import { secureStoreRouter } from "./routers/secure-store.js";
import { router } from "./trpc.js";

export const trpcRouter = router({
  os: osRouter,
  logs: logsRouter,
  secureStore: secureStoreRouter,
  encryption: encryptionRouter,
});

export type TrpcRouter = typeof trpcRouter;
