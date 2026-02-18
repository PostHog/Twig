import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  CloudTaskEvent,
  onUpdateInput,
  unwatchInput,
  updateTokenInput,
  watchInput,
} from "../../services/cloud-task/schemas.js";
import type { CloudTaskService } from "../../services/cloud-task/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<CloudTaskService>(MAIN_TOKENS.CloudTaskService);

export const cloudTaskRouter = router({
  watch: publicProcedure
    .input(watchInput)
    .mutation(({ input }) => getService().watch(input)),

  unwatch: publicProcedure
    .input(unwatchInput)
    .mutation(({ input }) => getService().unwatch(input.taskId, input.runId)),

  updateToken: publicProcedure
    .input(updateTokenInput)
    .mutation(({ input }) => getService().updateToken(input.token)),

  onUpdate: publicProcedure
    .input(onUpdateInput)
    .subscription(async function* (opts) {
      const service = getService();
      for await (const data of service.toIterable(CloudTaskEvent.Update, {
        signal: opts.signal,
      })) {
        if (
          data.taskId === opts.input.taskId &&
          data.runId === opts.input.runId
        ) {
          yield data;
        }
      }
    }),
});
