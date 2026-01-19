import type { ArtifactType, PostHogAPIConfig, StoredEntry, TaskRun, TaskRunArtifact } from "./types.js";

export interface TaskArtifactUploadPayload {
  name: string;
  type: ArtifactType;
  content: string;
  content_type?: string;
}

export type TaskRunUpdate = Partial<
  Pick<
    TaskRun,
    "status" | "branch" | "stage" | "error_message" | "output" | "state" | "environment"
  >
>;

export function getLlmGatewayUrl(posthogHost: string): string {
  const url = new URL(posthogHost);
  const hostname = url.hostname;

  // TODO: Migrate to twig
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${url.protocol}//localhost:3308/array`;
  }

  const regionMatch = hostname.match(/^(us|eu)\.posthog\.com$/);
  const region = regionMatch ? regionMatch[1] : "us";

  // TODO: Migrate to twig
  return `https://gateway.${region}.posthog.com/array`;
}

export class PostHogAPIClient {
  private config: PostHogAPIConfig;

  constructor(config: PostHogAPIConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    const host = this.config.apiUrl.endsWith("/")
      ? this.config.apiUrl.slice(0, -1)
      : this.config.apiUrl;
    return host;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.getApiKey()}`,
      "Content-Type": "application/json",
    };
  }

  private async apiRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage: string;
      try {
        const errorResponse = await response.json();
        errorMessage = `Failed request: [${response.status}] ${JSON.stringify(errorResponse)}`;
      } catch {
        errorMessage = `Failed request: [${response.status}] ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  private getTeamId(): number {
    return this.config.projectId;
  }

  getApiKey(): string {
    return this.config.getApiKey();
  }

  getLlmGatewayUrl(): string {
    return getLlmGatewayUrl(this.baseUrl);
  }

  async updateTaskRun(
    taskId: string,
    runId: string,
    payload: TaskRunUpdate,
  ): Promise<TaskRun> {
    const teamId = this.getTeamId();
    return this.apiRequest<TaskRun>(
      `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
  }

  async appendTaskRunLog(
    taskId: string,
    runId: string,
    entries: StoredEntry[],
  ): Promise<TaskRun> {
    const teamId = this.getTeamId();
    return this.apiRequest<TaskRun>(
      `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/append_log/`,
      {
        method: "POST",
        body: JSON.stringify({ entries }),
      },
    );
  }

  async uploadTaskArtifacts(
    taskId: string,
    runId: string,
    artifacts: TaskArtifactUploadPayload[],
  ): Promise<TaskRunArtifact[]> {
    if (!artifacts.length) {
      return [];
    }

    const teamId = this.getTeamId();
    const response = await this.apiRequest<{ artifacts: TaskRunArtifact[] }>(
      `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/artifacts/`,
      {
        method: "POST",
        body: JSON.stringify({ artifacts }),
      },
    );

    return response.artifacts ?? [];
  }

  async getArtifactPresignedUrl(
    taskId: string,
    runId: string,
    storagePath: string,
  ): Promise<string | null> {
    const teamId = this.getTeamId();
    try {
      const response = await this.apiRequest<{ url: string; expires_in: number }>(
        `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/artifacts/presign/`,
        {
          method: "POST",
          body: JSON.stringify({ storage_path: storagePath }),
        },
      );
      return response.url;
    } catch {
      return null;
    }
  }
}
