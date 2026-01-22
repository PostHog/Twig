import type { ArtifactType, FileManifest, PostHogAPIConfig, StoredEntry, TaskRun, TaskRunArtifact } from "./types.js";
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
   * Fetch logs from S3 using presigned URL from TaskRun
   * @param taskRun - The task run containing the log_url
   * @returns Array of stored entries, or empty array if no logs available
   */
  async fetchTaskRunLogs(taskRun: TaskRun): Promise<StoredEntry[]> {
    if (!taskRun.log_url) {
      return [];
    }

    try {
      const response = await fetch(taskRun.log_url);

      if (!response.ok) {
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

  /**
   * Get file manifest for a task run (used for cloud/local sync)
   * Returns null if no manifest exists
   */
  async getFileManifest(
    taskId: string,
    runId: string,
  ): Promise<FileManifest | null> {
    const teamId = this.getTeamId();
    try {
      const response = await fetch(
        `${this.baseUrl}/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/file_manifest/`,
        { headers: this.headers },
      );

      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to get file manifest: ${response.status}`);
      }

      return response.json();
    } catch {
      return null;
    }
  }

  /**
   * Update file manifest for a task run (used for cloud/local sync)
   */
  async putFileManifest(
    taskId: string,
    runId: string,
    manifest: FileManifest,
  ): Promise<FileManifest> {
    const teamId = this.getTeamId();
    return this.apiRequest<FileManifest>(
      `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/file_manifest/`,
      {
        method: "PUT",
        body: JSON.stringify(manifest),
      },
    );
  }
}
