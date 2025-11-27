import { logger } from "@renderer/lib/logger";
import type { LogEntry, Task, TaskRun } from "@shared/types";
import { buildApiFetcher } from "./fetcher";
import { createApiClient, type Schemas } from "./generated";

const log = logger.scope("posthog-client");

export class PostHogAPIClient {
  private api: ReturnType<typeof createApiClient>;
  private _teamId: number | null = null;

  constructor(
    accessToken: string,
    apiHost: string,
    onTokenRefresh?: () => Promise<string>,
    teamId?: number,
  ) {
    const baseUrl = apiHost.endsWith("/") ? apiHost.slice(0, -1) : apiHost;
    this.api = createApiClient(
      buildApiFetcher({
        apiToken: accessToken,
        onTokenRefresh,
      }),
      baseUrl,
    );
    if (teamId) {
      this._teamId = teamId;
    }
  }

  private async getTeamId(): Promise<number> {
    if (this._teamId !== null) {
      return this._teamId;
    }

    const user = await this.api.get("/api/users/{uuid}/", {
      path: { uuid: "@me" },
    });

    if (user?.team?.id) {
      this._teamId = user.team.id;
      return this._teamId;
    }

    throw new Error("No team found for user");
  }

  async getCurrentUser() {
    const data = await this.api.get("/api/users/{uuid}/", {
      path: { uuid: "@me" },
    });
    return data;
  }

  async getProject(projectId: number) {
    //@ts-expect-error this is not in the generated client
    const data = await this.api.get("/api/projects/{project_id}/", {
      path: { project_id: projectId.toString() },
    });
    return data as Schemas.Team;
  }

  async getTasks(repository?: string) {
    const teamId = await this.getTeamId();
    const params: Record<string, string | number> = {
      limit: 500,
    };

    if (repository) {
      params.repository = repository;
    }

    const data = await this.api.get(`/api/projects/{project_id}/tasks/`, {
      path: { project_id: teamId.toString() },
      query: params,
    });

    return data.results ?? [];
  }

  async getTask(taskId: string) {
    const teamId = await this.getTeamId();
    const data = await this.api.get(`/api/projects/{project_id}/tasks/{id}/`, {
      path: { project_id: teamId.toString(), id: taskId },
    });
    return data as unknown as Task;
  }

  async createTask(
    options: Pick<Task, "description"> &
      Partial<
        Pick<Task, "title" | "repository" | "json_schema" | "origin_product">
      > & {
        github_integration?: number | null;
      },
  ) {
    const teamId = await this.getTeamId();

    const data = await this.api.post(`/api/projects/{project_id}/tasks/`, {
      path: { project_id: teamId.toString() },
      body: {
        origin_product: "user_created",
        ...options,
      } as unknown as Schemas.Task,
    });

    return data;
  }

  async updateTask(taskId: string, updates: Partial<Schemas.Task>) {
    const teamId = await this.getTeamId();
    const data = await this.api.patch(
      `/api/projects/{project_id}/tasks/{id}/`,
      {
        path: { project_id: teamId.toString(), id: taskId },
        body: updates,
      },
    );

    return data;
  }

  async deleteTask(taskId: string) {
    const teamId = await this.getTeamId();
    await this.api.delete(`/api/projects/{project_id}/tasks/{id}/`, {
      path: { project_id: teamId.toString(), id: taskId },
    });
  }

  async duplicateTask(taskId: string) {
    const task = await this.getTask(taskId);
    return this.createTask({
      description: task.description ?? "",
      title: task.title,
      repository: task.repository,
      json_schema: task.json_schema,
      origin_product: task.origin_product,
      github_integration: task.github_integration,
    });
  }

  async runTaskInCloud(taskId: string): Promise<Task> {
    const teamId = await this.getTeamId();

    const data = await this.api.post(
      `/api/projects/{project_id}/tasks/{id}/run/`,
      {
        path: { project_id: teamId.toString(), id: taskId },
      },
    );

    return data as unknown as Task;
  }

  async listTaskRuns(taskId: string): Promise<TaskRun[]> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/tasks/${taskId}/runs/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/projects/${teamId}/tasks/${taskId}/runs/`,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch task runs: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results ?? data ?? [];
  }

  async getTaskRun(taskId: string, runId: string) {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/`,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch task run: ${response.statusText}`);
    }

    return await response.json();
  }

  async createTaskRun(taskId: string): Promise<TaskRun> {
    const teamId = await this.getTeamId();
    const data = await this.api.post(
      `/api/projects/{project_id}/tasks/{task_id}/runs/`,
      {
        path: { project_id: teamId.toString(), task_id: taskId },
        //@ts-expect-error the generated client does not infer the request type unless explicitly specified on the viewset
        body: {
          environment: "local" as const,
        },
      },
    );
    return data as unknown as TaskRun;
  }

  async updateTaskRun(
    taskId: string,
    runId: string,
    updates: Partial<
      Pick<
        TaskRun,
        "status" | "branch" | "stage" | "error_message" | "output" | "state"
      >
    >,
  ): Promise<TaskRun> {
    const teamId = await this.getTeamId();
    const data = await this.api.patch(
      `/api/projects/{project_id}/tasks/{task_id}/runs/{id}/`,
      {
        path: {
          project_id: teamId.toString(),
          task_id: taskId,
          id: runId,
        },
        body: updates,
      },
    );
    return data as unknown as TaskRun;
  }

  async getTaskLogs(taskId: string): Promise<LogEntry[]> {
    try {
      const task = (await this.getTask(taskId)) as unknown as Task;
      const logUrl = task?.latest_run?.log_url;

      if (!logUrl) {
        return [];
      }

      const response = await fetch(logUrl);

      if (!response.ok) {
        log.warn(
          `Failed to fetch logs: ${response.status} ${response.statusText}`,
        );
        return [];
      }

      const content = await response.text();

      if (!content.trim()) {
        return [];
      }
      return content
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as LogEntry);
    } catch (err) {
      log.warn("Failed to fetch task logs from latest run", err);
      return [];
    }
  }

  async getIntegrations() {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/environments/${teamId}/integrations/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/environments/${teamId}/integrations/`,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch integrations: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results ?? data ?? [];
  }

  async getGithubRepositories(
    integrationId: string | number,
  ): Promise<string[]> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/environments/${teamId}/integrations/${integrationId}/github_repos/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/environments/${teamId}/integrations/${integrationId}/github_repos/`,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch GitHub repositories: ${response.statusText}`,
      );
    }

    const data = await response.json();

    const integrations = await this.getIntegrations();
    const integration = integrations.find(
      (i: {
        id: number | string;
        display_name?: string;
        config?: { account?: { login?: string } };
      }) => i.id === integrationId,
    );
    const organization =
      integration?.display_name ||
      integration?.config?.account?.login ||
      "unknown";

    const repoNames = data.repositories ?? data.results ?? data ?? [];
    return repoNames.map(
      (repoName: string) =>
        `${organization.toLowerCase()}/${repoName.toLowerCase()}` as string,
    );
  }

  async getAgents() {
    const teamId = await this.getTeamId();
    const url = new URL(`${this.api.baseUrl}/api/projects/${teamId}/agents/`);
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/projects/${teamId}/agents/`,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch agents: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results ?? data ?? [];
  }

  async getUsers() {
    const data = await this.api.get("/api/users/", {
      query: { limit: 1000 },
    });
    return data.results ?? [];
  }
}
