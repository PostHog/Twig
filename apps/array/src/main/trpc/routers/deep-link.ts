import { get } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import type { TaskLinkService } from "../../services/task-link/service.js";
import { publicProcedure, router } from "../trpc.js";

export const deepLinkRouter = router({
  /**
   * Subscribe to task link deep link events.
   * Emits task ID when array://task/{taskId} is opened.
   */
  onOpenTask: publicProcedure.subscription(async function* () {
    const taskLinkService = get<TaskLinkService>(MAIN_TOKENS.TaskLinkService);

    // Create a queue to buffer events
    const queue: string[] = [];
    let resolve: (() => void) | null = null;

    const unsubscribe = taskLinkService.onTaskLink((taskId) => {
      queue.push(taskId);
      resolve?.();
    });

    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
        const taskId = queue.shift();
        if (taskId) {
          yield taskId;
        }
      }
    } finally {
      unsubscribe();
    }
  }),
});
