import { z } from "zod";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import type { SleepService } from "../../services/sleep/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<SleepService>(MAIN_TOKENS.SleepService);

export const sleepRouter = router({
  getEnabled: publicProcedure
    .output(z.boolean())
    .query(() => getService().getEnabled()),

  setEnabled: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => {
      getService().setEnabled(input.enabled);
    }),
});
