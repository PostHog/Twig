import { z } from "zod";
import { get } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import type { ExternalAppsService } from "../../services/external-apps/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  get<ExternalAppsService>(MAIN_TOKENS.ExternalAppsService);

export const externalAppsRouter = router({
  getDetectedApps: publicProcedure.query(() => getService().getDetectedApps()),

  openInApp: publicProcedure
    .input(z.object({ appId: z.string(), targetPath: z.string() }))
    .mutation(({ input }) =>
      getService().openInApp(input.appId, input.targetPath),
    ),

  setLastUsed: publicProcedure
    .input(z.object({ appId: z.string() }))
    .mutation(({ input }) => getService().setLastUsed(input.appId)),

  getLastUsed: publicProcedure.query(() => getService().getLastUsed()),

  copyPath: publicProcedure
    .input(z.object({ targetPath: z.string() }))
    .mutation(({ input }) => getService().copyPath(input.targetPath)),
});
