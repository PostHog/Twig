import { fetch } from "expo/fetch";
import { getCloudUrlFromRegion } from "../../../constants/oauth";
import { useAuthStore } from "../../../stores/authStore";
import type {
  CreateTaskOptions,
  Integration,
  StoredLogEntry,
  Task,
  TaskRun,
} from "../types/agent";

async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 200, shouldRetry } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const canRetry = shouldRetry ? shouldRetry(error) : true;

      if (isLastAttempt || !canRetry) {
        throw error;
      }

      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Unreachable");
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (/\b5\d{2}\b/.test(message)) return true;
    if (message.includes("network")) return true;
    if (message.includes("timeout")) return true;
    if (message.includes("econnreset")) return true;
  }
  return false;
}

function getAuthHeaders(): { Authorization: string; "Content-Type": string } {
  const { oauthAccessToken } = useAuthStore.getState();
  if (!oauthAccessToken) {
    throw new Error("Not authenticated");
  }
  return {
    Authorization: `Bearer ${oauthAccessToken}`,
    "Content-Type": "application/json",
  };
}

function getBaseUrl(): string {
  const { cloudRegion } = useAuthStore.getState();
  if (!cloudRegion) {
    throw new Error("No cloud region set");
  }
  return getCloudUrlFromRegion(cloudRegion);
}

function getProjectId(): number {
  const { projectId } = useAuthStore.getState();
  if (!projectId) {
    throw new Error("No project ID set");
  }
  return projectId;
}

export async function getTasks(repository?: string): Promise<Task[]> {
  const baseUrl = getBaseUrl();
  const projectId = getProjectId();
  const headers = getAuthHeaders();

  const params = new URLSearchParams({ limit: "500" });
  if (repository) {
    params.set("repository", repository);
  }

  const response = await fetch(
    `${baseUrl}/api/projects/${projectId}/tasks/?${params}`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch tasks: ${response.statusText}`);
  }

  const data = await response.json();
  return data.results ?? [];
}

export async function getTask(taskId: string): Promise<Task> {
  const baseUrl = getBaseUrl();
  const projectId = getProjectId();
  const headers = getAuthHeaders();

  const response = await fetch(
    `${baseUrl}/api/projects/${projectId}/tasks/${taskId}/`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch task: ${response.statusText}`);
  }

  return await response.json();
}

export async function createTask(options: CreateTaskOptions): Promise<Task> {
  const baseUrl = getBaseUrl();
  const projectId = getProjectId();
  const headers = getAuthHeaders();

  const response = await fetch(`${baseUrl}/api/projects/${projectId}/tasks/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      origin_product: "user_created",
      ...options,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Create task error:", errorText);
    throw new Error(
      `Failed to create task: ${response.statusText} - ${errorText}`,
    );
  }

  return await response.json();
}

export async function runTaskInCloud(taskId: string): Promise<Task> {
  const baseUrl = getBaseUrl();
  const projectId = getProjectId();
  const headers = getAuthHeaders();

  const response = await fetch(
    `${baseUrl}/api/projects/${projectId}/tasks/${taskId}/run/`,
    {
      method: "POST",
      headers,
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to run task: ${response.statusText}`);
  }

  return await response.json();
}

export async function getTaskRun(
  taskId: string,
  runId: string,
): Promise<TaskRun> {
  const baseUrl = getBaseUrl();
  const projectId = getProjectId();
  const headers = getAuthHeaders();

  const response = await fetch(
    `${baseUrl}/api/projects/${projectId}/tasks/${taskId}/runs/${runId}/`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch task run: ${response.statusText}`);
  }

  return await response.json();
}

export async function appendTaskRunLog(
  taskId: string,
  runId: string,
  entries: StoredLogEntry[],
): Promise<void> {
  return withRetry(
    async () => {
      const baseUrl = getBaseUrl();
      const projectId = getProjectId();
      const headers = getAuthHeaders();

      const response = await fetch(
        `${baseUrl}/api/projects/${projectId}/tasks/${taskId}/runs/${runId}/append_log/`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ entries }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to append log: ${response.statusText}`);
      }
    },
    { shouldRetry: isRetryableError },
  );
}

export async function fetchS3Logs(logUrl: string): Promise<string> {
  return withRetry(
    async () => {
      const response = await fetch(logUrl);

      if (!response.ok) {
        if (response.status === 404) {
          return "";
        }
        throw new Error(`Failed to fetch logs: ${response.statusText}`);
      }

      return await response.text();
    },
    { shouldRetry: isRetryableError },
  );
}

export async function getIntegrations(): Promise<Integration[]> {
  const baseUrl = getBaseUrl();
  const projectId = getProjectId();
  const headers = getAuthHeaders();

  const response = await fetch(
    `${baseUrl}/api/environments/${projectId}/integrations/`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch integrations: ${response.statusText}`);
  }

  const data = await response.json();
  return data.results ?? data ?? [];
}

export async function getGithubRepositories(
  integrationId: number,
): Promise<string[]> {
  const baseUrl = getBaseUrl();
  const projectId = getProjectId();
  const headers = getAuthHeaders();

  const response = await fetch(
    `${baseUrl}/api/environments/${projectId}/integrations/${integrationId}/github_repos/`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch repositories: ${response.statusText}`);
  }

  const data = await response.json();

  const integrations = await getIntegrations();
  const integration = integrations.find((i) => i.id === integrationId);
  const organization =
    integration?.display_name ||
    integration?.config?.account?.login ||
    "unknown";

  const repoNames = data.repositories ?? data.results ?? data ?? [];
  return repoNames.map(
    (repoName: string) =>
      `${organization.toLowerCase()}/${repoName.toLowerCase()}`,
  );
}
