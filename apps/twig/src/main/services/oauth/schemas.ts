import { z } from "zod";

export const cloudRegion = z.enum(["us", "eu", "dev"]);
export type CloudRegion = z.infer<typeof cloudRegion>;

/**
 * Error codes for OAuth operations.
 * - network_error: Transient network issue, should retry
 * - server_error: Server error (5xx), should retry
 * - auth_error: Authentication failed (invalid token, 401/403), should logout
 * - unknown_error: Other errors
 */
export const oAuthErrorCode = z.enum([
  "network_error",
  "server_error",
  "auth_error",
  "unknown_error",
]);
export type OAuthErrorCode = z.infer<typeof oAuthErrorCode>;

export const oAuthTokenResponse = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
  scope: z.string().optional().default(""),
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
  errorCode: oAuthErrorCode.optional(),
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
  errorCode: oAuthErrorCode.optional(),
});
export type RefreshTokenOutput = z.infer<typeof refreshTokenOutput>;

export const cancelFlowOutput = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
export type CancelFlowOutput = z.infer<typeof cancelFlowOutput>;

// Social auth schemas
export const socialProvider = z.enum(["google-oauth2", "github", "gitlab"]);
export type SocialProvider = z.infer<typeof socialProvider>;

export const openExternalUrlInput = z.object({
  url: z.string().url(),
});
export type OpenExternalUrlInput = z.infer<typeof openExternalUrlInput>;

// Password login schemas (first-party authentication)
export const loginWithPasswordInput = z.object({
  email: z.string().email(),
  password: z.string(),
  region: cloudRegion,
});
export type LoginWithPasswordInput = z.infer<typeof loginWithPasswordInput>;

export const twoFactorMethod = z.enum(["totp", "backup_codes", "passkey"]);
export type TwoFactorMethod = z.infer<typeof twoFactorMethod>;

export const loginWithPasswordOutput = z.union([
  // Success case - tokens returned directly
  z.object({
    success: z.literal(true),
    data: oAuthTokenResponse,
  }),
  // 2FA required
  z.object({
    success: z.literal(false),
    requires2FA: z.literal(true),
    sessionToken: z.string(),
    twoFactorMethods: z.array(twoFactorMethod),
  }),
  // Error case
  z.object({
    success: z.literal(false),
    requires2FA: z.literal(false).optional(),
    error: z.string(),
    errorCode: z.string().optional(),
    ssoProvider: z.string().optional(),
  }),
]);
export type LoginWithPasswordOutput = z.infer<typeof loginWithPasswordOutput>;

// 2FA completion schemas
export const complete2FAInput = z.object({
  code: z.string(),
  sessionToken: z.string(),
  region: cloudRegion,
});
export type Complete2FAInput = z.infer<typeof complete2FAInput>;

export const complete2FAOutput = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    data: oAuthTokenResponse,
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);
export type Complete2FAOutput = z.infer<typeof complete2FAOutput>;

// Signup with OAuth tokens schemas
export const signupWithOAuthInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  region: cloudRegion,
});
export type SignupWithOAuthInput = z.infer<typeof signupWithOAuthInput>;

export const signupWithOAuthOutput = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    data: oAuthTokenResponse,
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);
export type SignupWithOAuthOutput = z.infer<typeof signupWithOAuthOutput>;
