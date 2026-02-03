import { z } from "zod";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import type { ProcessTrackingService } from "../../services/process-tracking/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<ProcessTrackingService>(MAIN_TOKENS.ProcessTrackingService);

const processCategory = z.enum(["shell", "agent", "child"]);

export const processTrackingRouter = router({
  getSnapshot: publicProcedure
    .input(
      z
        .object({
          includeDiscovered: z.boolean().optional(),
        })
        .optional(),
    )
    .query(({ input }) =>
      getService().getSnapshot(input?.includeDiscovered ?? false),
    ),

  list: publicProcedure.query(() => getService().getAll()),

  kill: publicProcedure
    .input(z.object({ pid: z.number() }))
    .mutation(({ input }) => {
      getService().kill(input.pid);
    }),

  killByCategory: publicProcedure
    .input(z.object({ category: processCategory }))
    .mutation(({ input }) => {
      getService().killByCategory(input.category);
    }),

  killByTaskId: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(({ input }) => {
      getService().killByTaskId(input.taskId);
    }),

  listByTaskId: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(({ input }) => getService().getByTaskId(input.taskId)),

  killAll: publicProcedure.mutation(() => {
    getService().killAll();
  }),
});
