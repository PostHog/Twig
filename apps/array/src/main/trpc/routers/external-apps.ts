import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  copyPathInput,
  getDetectedAppsOutput,
  getLastUsedOutput,
  openInAppInput,
  openInAppOutput,
  setLastUsedInput,
} from "../../services/external-apps/schemas.js";
import type { ExternalAppsService } from "../../services/external-apps/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<ExternalAppsService>(MAIN_TOKENS.ExternalAppsService);

export const externalAppsRouter = router({
  getDetectedApps: publicProcedure
    .output(getDetectedAppsOutput)
    .query(() => getService().getDetectedApps()),

  openInApp: publicProcedure
    .input(openInAppInput)
    .output(openInAppOutput)
    .mutation(({ input }) =>
      getService().openInApp(input.appId, input.targetPath),
    ),

  setLastUsed: publicProcedure
    .input(setLastUsedInput)
    .mutation(({ input }) => getService().setLastUsed(input.appId)),

  getLastUsed: publicProcedure
    .output(getLastUsedOutput)
    .query(() => getService().getLastUsed()),

  copyPath: publicProcedure
    .input(copyPathInput)
    .mutation(({ input }) => getService().copyPath(input.targetPath)),
});
