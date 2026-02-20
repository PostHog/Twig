import type { CloudRegion } from "../types/oauth";

export const POSTHOG_US_CLIENT_ID = "HCWoE0aRFMYxIxFNTTwkOORn5LBjOt2GVDzwSw5W";
export const POSTHOG_EU_CLIENT_ID = "AIvijgMS0dxKEmr5z6odvRd8Pkh5vts3nPTzgzU9";
export const POSTHOG_DEV_CLIENT_ID = "DC5uRLVbGI02YQ82grxgnK6Qn12SXWpCqdPb60oZ";

// Bump OAUTH_SCOPE_VERSION below whenever OAUTH_SCOPES changes to force re-authentication
export const OAUTH_SCOPES = [
  // Twig app needs
  "user:read",
  "project:read",
  "task:write",
  "signal_report:read",
  "signal_report:write",
  "llm_gateway:read",
  "integration:read",
  "introspection",
  // MCP server scopes
  "action:read",
  "action:write",
  "dashboard:read",
  "dashboard:write",
  "error_tracking:read",
  "error_tracking:write",
  "event_definition:read",
  "event_definition:write",
  "experiment:read",
  "experiment:write",
  "feature_flag:read",
  "feature_flag:write",
  "insight:read",
  "insight:write",
  "logs:read",
  "organization:read",
  "property_definition:read",
  "query:read",
  "survey:read",
  "survey:write",
  "warehouse_table:read",
  "warehouse_view:read",
];

export const OAUTH_SCOPE_VERSION = 1;

// Token refresh settings
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry

export function getCloudUrlFromRegion(region: CloudRegion): string {
  switch (region) {
    case "us":
      return "https://us.posthog.com";
    case "eu":
      return "https://eu.posthog.com";
    case "dev":
      return "http://localhost:8010";
  }
}

export function getOauthClientIdFromRegion(region: CloudRegion): string {
  switch (region) {
    case "us":
      return POSTHOG_US_CLIENT_ID;
    case "eu":
      return POSTHOG_EU_CLIENT_ID;
    case "dev":
      return POSTHOG_DEV_CLIENT_ID;
  }
}
