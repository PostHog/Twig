import { z } from "zod";
import {
  identifyUser,
  resetUser,
  setCurrentUserId,
} from "../../services/posthog-analytics.js";
import { publicProcedure, router } from "../trpc.js";

export const analyticsRouter = router({
  /**
   * Set the current user ID for main process analytics
   */
  setUserId: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        properties: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional(),
      }),
    )
    .mutation(({ input }) => {
      setCurrentUserId(input.userId);
      if (input.properties) {
        identifyUser(
          input.userId,
          input.properties as Record<string, string | number | boolean>,
        );
      }
    }),

  /**
   * Reset the current user (on logout)
   */
  resetUser: publicProcedure.mutation(() => {
    resetUser();
  }),
});
