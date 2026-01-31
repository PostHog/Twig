import { z } from "zod";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  cloudRegion,
  complete2FAInput,
  complete2FAOutput,
  loginWithPasswordInput,
  loginWithPasswordOutput,
  signupWithOAuthInput,
  signupWithOAuthOutput,
  socialProvider,
  startFlowOutput,
} from "../../services/oauth/schemas.js";
import type { OAuthService } from "../../services/oauth/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<OAuthService>(MAIN_TOKENS.OAuthService);

export const authRouter = router({
  loginWithPassword: publicProcedure
    .input(loginWithPasswordInput)
    .output(loginWithPasswordOutput)
    .mutation(async ({ input }) => {
      return getService().loginWithPassword(input);
    }),

  complete2FA: publicProcedure
    .input(complete2FAInput)
    .output(complete2FAOutput)
    .mutation(async ({ input }) => {
      return getService().complete2FA(input);
    }),

  signupWithOAuth: publicProcedure
    .input(signupWithOAuthInput)
    .output(signupWithOAuthOutput)
    .mutation(async ({ input }) => {
      return getService().signupWithOAuth(input);
    }),

  // Get first-party social auth URL (includes OAuth params for direct redirect back to Twig)
  getFirstPartySocialAuthUrl: publicProcedure
    .input(
      z.object({
        provider: socialProvider,
        region: cloudRegion,
      }),
    )
    .output(
      z.object({
        url: z.string(),
        codeVerifier: z.string(),
      }),
    )
    .query(({ input }) =>
      getService().getFirstPartySocialAuthUrl(input.provider, input.region),
    ),

  // Start first-party social auth flow (opens browser, waits for callback, returns tokens)
  startFirstPartySocialAuth: publicProcedure
    .input(
      z.object({
        provider: socialProvider,
        region: cloudRegion,
      }),
    )
    .output(startFlowOutput)
    .mutation(async ({ input }) =>
      getService().startFirstPartySocialAuth(input.provider, input.region),
    ),
});
