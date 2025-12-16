import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  cancelFlowOutput,
  refreshTokenInput,
  refreshTokenOutput,
  startFlowInput,
  startFlowOutput,
} from "../../services/oauth/schemas.js";
import type { OAuthService } from "../../services/oauth/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<OAuthService>(MAIN_TOKENS.OAuthService);

export const oauthRouter = router({
  startFlow: publicProcedure
    .input(startFlowInput)
    .output(startFlowOutput)
    .mutation(({ input }) => getService().startFlow(input.region)),

  refreshToken: publicProcedure
    .input(refreshTokenInput)
    .output(refreshTokenOutput)
    .mutation(({ input }) =>
      getService().refreshToken(input.refreshToken, input.region),
    ),

  cancelFlow: publicProcedure
    .output(cancelFlowOutput)
    .mutation(() => getService().cancelFlow()),
});
