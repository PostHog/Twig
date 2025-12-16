import { deepLinkRouter } from "./routers/deep-link.js";
import { encryptionRouter } from "./routers/encryption.js";
import { gitRouter } from "./routers/git.js";
import { logsRouter } from "./routers/logs.js";
import { oauthRouter } from "./routers/oauth.js";
import { osRouter } from "./routers/os.js";
import { secureStoreRouter } from "./routers/secure-store.js";
import { router } from "./trpc.js";

export const trpcRouter = router({
  os: osRouter,
  logs: logsRouter,
  secureStore: secureStoreRouter,
  encryption: encryptionRouter,
  git: gitRouter,
  oauth: oauthRouter,
  deepLink: deepLinkRouter,
});

export type TrpcRouter = typeof trpcRouter;
