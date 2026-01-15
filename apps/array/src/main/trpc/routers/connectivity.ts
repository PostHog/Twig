import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  ConnectivityEvent,
  type ConnectivityEvents,
  connectivityStatusOutput,
} from "../../services/connectivity/schemas.js";
import type { ConnectivityService } from "../../services/connectivity/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<ConnectivityService>(MAIN_TOKENS.ConnectivityService);

function subscribe<K extends keyof ConnectivityEvents>(event: K) {
  return publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(event, { signal: opts.signal });
    for await (const data of iterable) {
      yield data;
    }
  });
}

export const connectivityRouter = router({
  getStatus: publicProcedure.output(connectivityStatusOutput).query(() => {
    const service = getService();
    return service.getStatus();
  }),

  checkNow: publicProcedure
    .output(connectivityStatusOutput)
    .mutation(async () => {
      const service = getService();
      return service.checkNow();
    }),

  onStatusChange: subscribe(ConnectivityEvent.StatusChange),
});
