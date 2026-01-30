import type { PostHogAPIClient } from "../../posthog-api.js";
import { createMockApiClient, createTaskRun, type TestRepo } from "./api.js";

export interface AgentServerConfig {
  apiUrl: string;
  apiKey: string;
  projectId: number;
  taskId: string;
  runId: string;
  repositoryPath: string;
  apiClient?: PostHogAPIClient;
  initialPrompt?: string;
}

export function createAgentServerConfig(
  repo: TestRepo,
  overrides: Partial<AgentServerConfig> = {},
): AgentServerConfig {
  return {
    apiUrl: "http://localhost:8000",
    apiKey: "test-api-key",
    projectId: 1,
    taskId: "task-1",
    runId: "run-1",
    repositoryPath: repo.path,
    apiClient: createMockApiClient({
      getTaskRun: async () => createTaskRun({ log_url: "" }),
      fetchTaskRunLogs: async () => [],
    }),
    ...overrides,
  };
}
