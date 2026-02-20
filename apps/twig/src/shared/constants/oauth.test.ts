import { describe, expect, it } from "vitest";
import { OAUTH_SCOPE_VERSION, OAUTH_SCOPES } from "./oauth";

describe("OAUTH_SCOPES guard", () => {
  it("snapshot breaks when scopes change — bump OAUTH_SCOPE_VERSION if this fails", () => {
    expect({
      scopeVersion: OAUTH_SCOPE_VERSION,
      scopes: OAUTH_SCOPES,
    }).toMatchInlineSnapshot(`
      {
        "scopeVersion": 1,
        "scopes": [
          "user:read",
          "project:read",
          "task:write",
          "llm_gateway:read",
          "integration:read",
          "introspection",
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
        ],
      }
    `);
  });
});
