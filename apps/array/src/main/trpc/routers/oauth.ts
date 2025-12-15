import { z } from "zod";
import { get } from "@/main/di/container.js";
import { MAIN_TOKENS } from "@/main/di/tokens.js";
import type { OAuthService } from "@/main/services/oauth/service.js";
import { publicProcedure, router } from "../trpc.js";

const cloudRegionSchema = z.enum(["us", "eu", "dev"]);

const oauthTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
  scope: z.string(),
  refresh_token: z.string(),
  scoped_teams: z.array(z.number()).optional(),
  scoped_organizations: z.array(z.string()).optional(),
});

export type OAuthTokenResponse = z.infer<typeof oauthTokenResponseSchema>;

export const oauthRouter = router({
  startFlow: publicProcedure
    .input(z.object({ region: cloudRegionSchema }))
    .mutation(async ({ input }) => {
      const oauthService = get<OAuthService>(MAIN_TOKENS.OAuthService);
      const tokenResponse = await oauthService.startFlow(input.region);
      return oauthTokenResponseSchema.parse(tokenResponse);
    }),

  refreshToken: publicProcedure
    .input(
      z.object({
        refreshToken: z.string(),
        region: cloudRegionSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const oauthService = get<OAuthService>(MAIN_TOKENS.OAuthService);
      const tokenResponse = await oauthService.refreshToken(
        input.refreshToken,
        input.region,
      );
      return oauthTokenResponseSchema.parse(tokenResponse);
    }),

  cancelFlow: publicProcedure.mutation(async () => {
    const oauthService = get<OAuthService>(MAIN_TOKENS.OAuthService);
    oauthService.cancelFlow();
    return { success: true };
  }),
});
