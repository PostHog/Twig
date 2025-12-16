import { on } from "node:events";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  checkForUpdatesOutput,
  installUpdateOutput,
  isEnabledOutput,
  UpdatesEvent,
  type UpdatesStatusPayload,
} from "../../services/updates/schemas.js";
import type { UpdatesService } from "../../services/updates/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<UpdatesService>(MAIN_TOKENS.UpdatesService);

function subscribe<T>(event: string) {
  return publicProcedure.subscription(async function* (opts): AsyncGenerator<
    T,
    void,
    unknown
  > {
    const service = getService();
    const options = opts.signal ? { signal: opts.signal } : undefined;
    for await (const [payload] of on(service, event, options)) {
      yield payload as T;
    }
  });
}

export const updatesRouter = router({
  isEnabled: publicProcedure.output(isEnabledOutput).query(() => {
    const service = getService();
    return { enabled: service.isEnabled };
  }),

  check: publicProcedure.output(checkForUpdatesOutput).mutation(() => {
    const service = getService();
    return service.checkForUpdates();
  }),

  install: publicProcedure.output(installUpdateOutput).mutation(() => {
    const service = getService();
    return service.installUpdate();
  }),

  onReady: subscribe<void>(UpdatesEvent.Ready),
  onStatus: subscribe<UpdatesStatusPayload>(UpdatesEvent.Status),
  onCheckFromMenu: subscribe<void>(UpdatesEvent.CheckFromMenu),
});
