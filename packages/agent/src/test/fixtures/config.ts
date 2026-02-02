import type { AgentServerConfig } from "../../server/types.js";
import type { TestRepo } from "./api.js";

export type { AgentServerConfig };

export function createAgentServerConfig(
  repo: TestRepo,
  overrides: Partial<AgentServerConfig> = {},
): AgentServerConfig {
  return {
    port: 3001,
    repositoryPath: repo.path,
    apiUrl: "http://localhost:8000",
    apiKey: "test-api-key",
    projectId: 1,
    jwtSecret: "test-jwt-secret",
    ...overrides,
  };
}
