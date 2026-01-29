import type { ArtifactType, PostHogAPIConfig, StoredEntry, TaskRun, TaskRunArtifact } from "./types.js";
import { getLlmGatewayUrl } from "./utils/gateway.js";

export interface TaskArtifactUploadPayload {
  name: string;
  type: ArtifactType;
  content: string;
  content_type?: string;
}

export type TaskRunUpdate = Partial<
  Pick<
    TaskRun,
    | "status"
    | "branch"
    | "stage"
    | "error_message"
    | "output"
    | "state"
    | "environment"
  >
>;

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

  async getTaskRun(taskId: string, runId: string): Promise<TaskRun> {
    const teamId = this.getTeamId();
    return this.apiRequest<TaskRun>(
      `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/`,
    );
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
      const response = await this.apiRequest<{
        url: string;
        expires_in: number;
      }>(
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

  /**
   * Download artifact content by storage path
   * Gets a presigned URL and fetches the content
   */
  async downloadArtifact(
    taskId: string,
    runId: string,
    storagePath: string,
  ): Promise<ArrayBuffer | null> {
    const url = await this.getArtifactPresignedUrl(taskId, runId, storagePath);
    if (!url) {
      return null;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download artifact: ${response.status}`);
      }
      return response.arrayBuffer();
    } catch {
      return null;
    }
  }

  /**
   * Fetch logs for a task run via the logs API endpoint
   * @param taskRun - The task run to fetch logs for
   * @returns Array of stored entries, or empty array if no logs available
   */
  async fetchTaskRunLogs(taskRun: TaskRun): Promise<StoredEntry[]> {
    const teamId = this.getTeamId();

    try {
      const response = await fetch(
        `${this.baseUrl}/api/projects/${teamId}/tasks/${taskRun.task}/runs/${taskRun.id}/logs`,
        { headers: this.headers },
      );

      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        throw new Error(
          `Failed to fetch logs: ${response.status} ${response.statusText}`,
        );
      }

      const content = await response.text();

      if (!content.trim()) {
        return [];
      }

      // Parse newline-delimited JSON
      return content
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as StoredEntry);
    } catch (error) {
      throw new Error(
        `Failed to fetch task run logs: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

}
