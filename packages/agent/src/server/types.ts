import type { PostHogAPIClient } from "../posthog-api.js";

export interface AgentServerConfig {
  apiUrl: string;
  apiKey: string;
  projectId: number;
  taskId: string;
  runId: string;
  repositoryPath: string;
  initialPrompt?: string;
  apiClient?: PostHogAPIClient;
}
