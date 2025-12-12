import { osRouter } from "./routers/os.js";
import { router } from "./trpc.js";

export const trpcRouter = router({
  os: osRouter,
});

export type TrpcRouter = typeof trpcRouter;
