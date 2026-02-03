import { z } from "zod";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import type { PowerSaveBlockerService } from "../../services/power-save-blocker/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<PowerSaveBlockerService>(MAIN_TOKENS.PowerSaveBlockerService);

export const powerSaveBlockerRouter = router({
  getEnabled: publicProcedure
    .output(z.boolean())
    .query(() => getService().getEnabled()),

  setEnabled: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => {
      getService().setEnabled(input.enabled);
    }),
});
