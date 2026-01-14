import type {
  PostHogAPIConfig,
  PostHogResource,
  StoredEntry,
  Task,
  TaskArtifactUploadPayload,
  TaskRun,
  TaskRunArtifact,
  UrlMention,
} from "./types.js";
import { getLlmGatewayUrl } from "./utils/gateway.js";

interface PostHogApiResponse<T> {
  results?: T[];
  count?: number;
  next?: string | null;
  previous?: string | null;
}

export type TaskRunUpdate = Partial<
  Pick<
    TaskRun,
    "status" | "branch" | "stage" | "error_message" | "output" | "state"
  >
>;

export type TaskCreatePayload = Pick<Task, "description"> &
  Partial<Pick<Task, "title" | "repository" | "origin_product">>;

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

  getTeamId(): number {
    return this.config.projectId;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getApiKey(): string {
    return this.config.getApiKey();
  }

  getLlmGatewayUrl(): string {
    return getLlmGatewayUrl(this.baseUrl);
  }

  async fetchTask(taskId: string): Promise<Task> {
    const teamId = this.getTeamId();
    return this.apiRequest<Task>(`/api/projects/${teamId}/tasks/${taskId}/`);
  }

  async listTasks(filters?: {
    repository?: string;
    organization?: string;
    origin_product?: string;
  }): Promise<Task[]> {
    const teamId = this.getTeamId();
    const url = new URL(`${this.baseUrl}/api/projects/${teamId}/tasks/`);

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) url.searchParams.append(key, value);
      });
    }

    const response = await this.apiRequest<PostHogApiResponse<Task>>(
      url.pathname + url.search,
    );

    return response.results || [];
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
    const teamId = this.getTeamId();
    return this.apiRequest<Task>(`/api/projects/${teamId}/tasks/${taskId}/`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async createTask(payload: TaskCreatePayload): Promise<Task> {
    const teamId = this.getTeamId();
    return this.apiRequest<Task>(`/api/projects/${teamId}/tasks/`, {
      method: "POST",
      body: JSON.stringify({
        origin_product: "user_created",
        ...payload,
      }),
    });
  }

  // TaskRun methods
  async listTaskRuns(taskId: string): Promise<TaskRun[]> {
    const teamId = this.getTeamId();
    const response = await this.apiRequest<PostHogApiResponse<TaskRun>>(
      `/api/projects/${teamId}/tasks/${taskId}/runs/`,
    );
    return response.results || [];
  }

  async getTaskRun(taskId: string, runId: string): Promise<TaskRun> {
    const teamId = this.getTeamId();
    return this.apiRequest<TaskRun>(
      `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/`,
    );
  }

  async createTaskRun(
    taskId: string,
    payload?: Partial<
      Omit<
        TaskRun,
        | "id"
        | "task"
        | "team"
        | "created_at"
        | "updated_at"
        | "completed_at"
        | "artifacts"
      >
    >,
  ): Promise<TaskRun> {
    const teamId = this.getTeamId();
    return this.apiRequest<TaskRun>(
      `/api/projects/${teamId}/tasks/${taskId}/runs/`,
      {
        method: "POST",
        body: JSON.stringify(payload || {}),
      },
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

  async setTaskRunOutput(
    taskId: string,
    runId: string,
    output: Record<string, unknown>,
  ): Promise<TaskRun> {
    const teamId = this.getTeamId();
    return this.apiRequest<TaskRun>(
      `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/set_output/`,
      {
        method: "PATCH",
        body: JSON.stringify({ output }),
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
   * Fetch error details from PostHog error tracking
   */
  async fetchErrorDetails(
    errorId: string,
    projectId?: string,
  ): Promise<PostHogResource> {
    const teamId = projectId ? parseInt(projectId, 10) : this.getTeamId();

    try {
      const errorData = await this.apiRequest<Record<string, unknown>>(
        `/api/projects/${teamId}/error_tracking/${errorId}/`,
      );

      // Format error details for agent consumption
      const content = this.formatErrorContent(errorData);

      return {
        type: "error",
        id: errorId,
        url: `${this.baseUrl}/project/${teamId}/error_tracking/${errorId}`,
        title:
          (typeof errorData.exception_type === "string"
            ? errorData.exception_type
            : undefined) || "Unknown Error",
        content,
        metadata: {
          exception_type: errorData.exception_type,
          first_seen: errorData.first_seen,
          last_seen: errorData.last_seen,
          volume: errorData.volume,
          users_affected: errorData.users_affected,
        },
      };
    } catch (error) {
      throw new Error(`Failed to fetch error details for ${errorId}: ${error}`);
    }
  }

  /**
   * Generic resource fetcher by URL or ID
   */
  async fetchResourceByUrl(urlMention: UrlMention): Promise<PostHogResource> {
    switch (urlMention.type) {
      case "error": {
        if (!urlMention.id) {
          throw new Error("Error ID is required for error resources");
        }
        // Extract project ID from URL if available, otherwise use default team
        let projectId: string | undefined;
        if (urlMention.url) {
          const projectIdMatch = urlMention.url.match(/\/project\/(\d+)\//);
          projectId = projectIdMatch ? projectIdMatch[1] : undefined;
        }
        return this.fetchErrorDetails(urlMention.id, projectId);
      }

      case "experiment":
      case "insight":
      case "feature_flag":
        throw new Error(
          `Resource type '${urlMention.type}' not yet implemented`,
        );

      case "generic":
        // Return a minimal resource for generic URLs
        return {
          type: "generic",
          id: "",
          url: urlMention.url,
          title: "Generic Resource",
          content: `Generic resource: ${urlMention.url}`,
          metadata: {},
        };

      default:
        throw new Error(`Unknown resource type: ${urlMention.type}`);
    }
  }

  /**
   * Format error data for agent consumption
   */
  private formatErrorContent(errorData: Record<string, unknown>): string {
    const sections = [];

    if (errorData.exception_type) {
      sections.push(`**Error Type**: ${errorData.exception_type}`);
    }

    if (errorData.exception_message) {
      sections.push(`**Message**: ${errorData.exception_message}`);
    }

    if (errorData.stack_trace) {
      sections.push(
        `**Stack Trace**:\n\`\`\`\n${errorData.stack_trace}\n\`\`\``,
      );
    }

    if (errorData.volume) {
      sections.push(`**Volume**: ${errorData.volume} occurrences`);
    }

    if (errorData.users_affected) {
      sections.push(`**Users Affected**: ${errorData.users_affected}`);
    }

    if (errorData.first_seen && errorData.last_seen) {
      sections.push(`**First Seen**: ${errorData.first_seen}`);
      sections.push(`**Last Seen**: ${errorData.last_seen}`);
    }

    if (errorData.properties && Object.keys(errorData.properties).length > 0) {
      sections.push(
        `**Properties**: ${JSON.stringify(errorData.properties, null, 2)}`,
      );
    }

    return sections.join("\n\n");
  }
}
