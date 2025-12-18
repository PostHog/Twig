import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  TaskLinkEvent,
  type TaskLinkService,
} from "../../services/task-link/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<TaskLinkService>(MAIN_TOKENS.TaskLinkService);

export const deepLinkRouter = router({
  /**
   * Subscribe to task link deep link events.
   * Emits task ID when array://task/{taskId} is opened.
   */
  onOpenTask: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(TaskLinkEvent.OpenTask, {
      signal: opts.signal,
    });
    for await (const data of iterable) {
      yield data;
    }
  }),

  /**
   * Get any pending task ID that arrived before renderer was ready.
   * This handles the case where the app is launched via deep link.
   */
  getPendingTaskId: publicProcedure.query(() => {
    const service = getService();
    return service.consumePendingTaskId();
  }),
});
