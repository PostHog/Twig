import { on } from "node:events";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  TaskLinkEvent,
  type TaskLinkEvents,
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
    const options = opts.signal ? { signal: opts.signal } : undefined;
    for await (const [payload] of on(service, TaskLinkEvent.OpenTask, options)) {
      yield payload as TaskLinkEvents[typeof TaskLinkEvent.OpenTask];
    }
  }),
});
