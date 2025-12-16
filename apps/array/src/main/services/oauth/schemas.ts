import { z } from "zod";

export const cloudRegion = z.enum(["us", "eu", "dev"]);
export type CloudRegion = z.infer<typeof cloudRegion>;

export const oAuthTokenResponse = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
  scope: z.string(),
  refresh_token: z.string(),
  scoped_teams: z.array(z.number()).optional(),
  scoped_organizations: z.array(z.string()).optional(),
});
export type OAuthTokenResponse = z.infer<typeof oAuthTokenResponse>;

export const startFlowInput = z.object({
  region: cloudRegion,
});
export type StartFlowInput = z.infer<typeof startFlowInput>;

export const startFlowOutput = z.object({
  success: z.boolean(),
  data: oAuthTokenResponse.optional(),
  error: z.string().optional(),
});
export type StartFlowOutput = z.infer<typeof startFlowOutput>;

export const refreshTokenInput = z.object({
  refreshToken: z.string(),
  region: cloudRegion,
});
export type RefreshTokenInput = z.infer<typeof refreshTokenInput>;

export const refreshTokenOutput = z.object({
  success: z.boolean(),
  data: oAuthTokenResponse.optional(),
  error: z.string().optional(),
});
export type RefreshTokenOutput = z.infer<typeof refreshTokenOutput>;

export const cancelFlowOutput = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
export type CancelFlowOutput = z.infer<typeof cancelFlowOutput>;
