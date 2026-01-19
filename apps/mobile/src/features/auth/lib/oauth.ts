import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import type { CloudRegion, OAuthConfig, OAuthTokenResponse } from "../types";
import { getCloudUrlFromRegion, getOauthClientIdFromRegion } from "./constants";

// Required for web browser auth session to work properly
WebBrowser.maybeCompleteAuthSession();

export function getRedirectUri(): string {
  return AuthSession.makeRedirectUri({
    scheme: "posthog",
    path: "callback",
  });
}

export function getAuthorizationEndpoint(region: CloudRegion): string {
  return `${getCloudUrlFromRegion(region)}/oauth/authorize`;
}

export function getTokenEndpoint(region: CloudRegion): string {
  return `${getCloudUrlFromRegion(region)}/oauth/token`;
}

export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  config: OAuthConfig,
): Promise<OAuthTokenResponse> {
  const cloudUrl = getCloudUrlFromRegion(config.cloudRegion);
  const redirectUri = getRedirectUri();

  const response = await fetch(`${cloudUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: getOauthClientIdFromRegion(config.cloudRegion),
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Token exchange failed: ${response.statusText} - ${errorText}`,
    );
  }

  return response.json();
}

export async function refreshAccessToken(
  refreshToken: string,
  region: CloudRegion,
): Promise<OAuthTokenResponse> {
  const cloudUrl = getCloudUrlFromRegion(region);

  const response = await fetch(`${cloudUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: getOauthClientIdFromRegion(region),
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.statusText}`);
  }

  return response.json();
}

export interface OAuthFlowResult {
  success: boolean;
  data?: OAuthTokenResponse;
  error?: string;
}

export async function performOAuthFlow(
  config: OAuthConfig,
): Promise<OAuthFlowResult> {
  try {
    const redirectUri = getRedirectUri();
    const clientId = getOauthClientIdFromRegion(config.cloudRegion);

    const discovery: AuthSession.DiscoveryDocument = {
      authorizationEndpoint: getAuthorizationEndpoint(config.cloudRegion),
      tokenEndpoint: getTokenEndpoint(config.cloudRegion),
    };

    // Let expo-auth-session handle PKCE internally
    const authRequest = new AuthSession.AuthRequest({
      clientId,
      scopes: config.scopes,
      redirectUri,
      usePKCE: true,
      extraParams: {
        required_access_level: "project",
      },
    });

    // promptAsync will load the request internally and generate PKCE
    const authResult = await authRequest.promptAsync(discovery);

    if (authResult.type === "cancel" || authResult.type === "dismiss") {
      return {
        success: false,
        error: "Authorization cancelled",
      };
    }

    if (authResult.type === "error") {
      return {
        success: false,
        error: authResult.error?.message || "Authorization failed",
      };
    }

    if (authResult.type !== "success" || !authResult.params.code) {
      return {
        success: false,
        error: "No authorization code received",
      };
    }

    // Use the AuthRequest's codeVerifier for token exchange
    if (!authRequest.codeVerifier) {
      return {
        success: false,
        error: "PKCE code verifier not available",
      };
    }

    const tokenResponse = await exchangeCodeForToken(
      authResult.params.code,
      authRequest.codeVerifier,
      config,
    );

    return {
      success: true,
      data: tokenResponse,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
