import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  checkForUpdatesOutput,
  installUpdateOutput,
  isEnabledOutput,
  UpdatesEvent,
  type UpdatesEvents,
} from "../../services/updates/schemas.js";
import type { UpdatesService } from "../../services/updates/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<UpdatesService>(MAIN_TOKENS.UpdatesService);

function subscribe<K extends keyof UpdatesEvents>(event: K) {
  return publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(event, { signal: opts.signal });
    for await (const data of iterable) {
      yield data;
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

  onReady: subscribe(UpdatesEvent.Ready),
  onStatus: subscribe(UpdatesEvent.Status),
  onCheckFromMenu: subscribe(UpdatesEvent.CheckFromMenu),
});
