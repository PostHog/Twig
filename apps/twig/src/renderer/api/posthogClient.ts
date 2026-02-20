import { logger } from "@renderer/lib/logger";
import type {
  RepoAutonomyStatus,
  SignalReportArtefact,
  SignalReportArtefactsResponse,
  SignalReportsResponse,
  Task,
  TaskRun,
} from "@shared/types";
import type { StoredLogEntry } from "@shared/types/session-events";
import { buildApiFetcher } from "./fetcher";
import { createApiClient, type Schemas } from "./generated";

const log = logger.scope("posthog-client");

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeSignalReportArtefact(
  value: unknown,
): SignalReportArtefact | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const id = optionalString(value.id);
  if (!id) {
    return null;
  }

  const contentValue = isObjectRecord(value.content) ? value.content : null;
  if (!contentValue) {
    return null;
  }

  const content = optionalString(contentValue.content);
  const sessionId = optionalString(contentValue.session_id);

  // The backend may return empty content objects when binary decode fails.
  if (!content && !sessionId) {
    return null;
  }

  return {
    id,
    type: optionalString(value.type) ?? "unknown",
    created_at: optionalString(value.created_at) ?? new Date(0).toISOString(),
    content: {
      session_id: sessionId ?? "",
      start_time: optionalString(contentValue.start_time) ?? "",
      end_time: optionalString(contentValue.end_time) ?? "",
      distinct_id: optionalString(contentValue.distinct_id) ?? "",
      content: content ?? "",
      distance_to_centroid:
        typeof contentValue.distance_to_centroid === "number"
          ? contentValue.distance_to_centroid
          : null,
    },
  };
}

function parseSignalReportArtefactsPayload(
  value: unknown,
): SignalReportArtefactsResponse {
  const payload = isObjectRecord(value) ? value : null;
  const rawResults = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(value)
      ? value
      : [];

  const results = rawResults
    .map(normalizeSignalReportArtefact)
    .filter((artefact): artefact is SignalReportArtefact => artefact !== null);
  const count =
    typeof payload?.count === "number" ? payload.count : results.length;

  if (rawResults.length > 0 && results.length === 0) {
    return {
      results: [],
      count: 0,
      unavailableReason: "invalid_payload",
    };
  }

  return {
    results,
    count,
  };
}

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

  async getProjectAutonomySettings(projectId: number): Promise<{
    proactive_tasks_enabled?: boolean;
  }> {
    try {
      const urlPath = `/api/environments/${projectId}/`;
      const url = new URL(`${this.api.baseUrl}${urlPath}`);
      const response = await this.api.fetcher.fetch({
        method: "get",
        url,
        path: urlPath,
      });
      const data = (await response.json()) as {
        proactive_tasks_enabled?: boolean;
      };

      return {
        proactive_tasks_enabled:
          typeof data.proactive_tasks_enabled === "boolean"
            ? data.proactive_tasks_enabled
            : false,
      };
    } catch (error) {
      log.warn("Failed to resolve autonomy settings; defaulting to disabled", {
        projectId,
        error,
      });
      return { proactive_tasks_enabled: false };
    }
  }

  async getTasks(options?: {
    repository?: string;
    createdBy?: number;
    originProduct?: string;
  }) {
    const teamId = await this.getTeamId();
    const params: Record<string, string | number> = {
      limit: 500,
    };

    if (options?.repository) {
      params.repository = options.repository;
    }

    if (options?.createdBy) {
      params.created_by = options.createdBy;
    }

    if (options?.originProduct) {
      params.origin_product = options.originProduct;
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

  async getTaskRun(taskId: string, runId: string): Promise<TaskRun> {
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
        body: updates as Record<string, unknown>,
      },
    );
    return data as unknown as TaskRun;
  }

  /**
   * Append events to a task run's S3 log file
   */
  async appendTaskRunLog(
    taskId: string,
    runId: string,
    entries: StoredLogEntry[],
  ): Promise<void> {
    const teamId = await this.getTeamId();
    const url = `${this.api.baseUrl}/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/append_log/`;
    const response = await this.api.fetcher.fetch({
      method: "post",
      url: new URL(url),
      path: url,
      overrides: {
        body: JSON.stringify({ entries }),
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to append log: ${response.statusText}`);
    }
  }

  async getTaskRunSessionLogs(
    taskId: string,
    runId: string,
    options?: { limit?: number; after?: string },
  ): Promise<StoredLogEntry[]> {
    try {
      const teamId = await this.getTeamId();
      const url = new URL(
        `${this.api.baseUrl}/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/session_logs/`,
      );
      url.searchParams.set("limit", String(options?.limit ?? 5000));
      if (options?.after) {
        url.searchParams.set("after", options.after);
      }
      const response = await this.api.fetcher.fetch({
        method: "get",
        url,
        path: `/api/projects/${teamId}/tasks/${taskId}/runs/${runId}/session_logs/`,
      });

      if (!response.ok) {
        log.warn(
          `Failed to fetch session logs: ${response.status} ${response.statusText}`,
        );
        return [];
      }

      return (await response.json()) as StoredLogEntry[];
    } catch (err) {
      log.warn("Failed to fetch task run session logs", err);
      return [];
    }
  }

  async getTaskLogs(taskId: string): Promise<StoredLogEntry[]> {
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
        .map((line) => JSON.parse(line) as StoredLogEntry);
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

  async updateTeam(updates: {
    session_recording_opt_in?: boolean;
    autocapture_exceptions_opt_in?: boolean;
  }): Promise<Schemas.Team> {
    const teamId = await this.getTeamId();
    const url = new URL(`${this.api.baseUrl}/api/projects/${teamId}/`);
    const response = await this.api.fetcher.fetch({
      method: "patch",
      url,
      path: `/api/projects/${teamId}/`,
      overrides: {
        body: JSON.stringify(updates),
      },
    });

    if (!response.ok) {
      const responseText = await response.text();
      let detail = responseText;
      try {
        const parsed = JSON.parse(responseText) as
          | { detail?: string }
          | Record<string, unknown>;
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "detail" in parsed &&
          typeof parsed.detail === "string"
        ) {
          detail = parsed.detail;
        } else if (typeof parsed === "object" && parsed !== null) {
          detail = Object.entries(parsed)
            .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
            .join(", ");
        }
      } catch {
        // keep plain text fallback
      }

      throw new Error(
        `Failed to update team: ${detail || response.statusText}`,
      );
    }

    return await response.json();
  }

  /**
   * Get all organizations the user belongs to.
   */
  async getOrganizations(): Promise<
    Array<{ id: string; name: string; slug: string }>
  > {
    const url = new URL(`${this.api.baseUrl}/api/organizations/`);
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: "/api/organizations/",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch organizations: ${response.statusText}`);
    }

    const data = await response.json();
    const orgs = data.results ?? data ?? [];
    return orgs.map((org: { id: string; name: string; slug?: string }) => ({
      id: org.id,
      name: org.name,
      slug: org.slug ?? org.id,
    }));
  }

  async getSignalReports(): Promise<SignalReportsResponse> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/signal_reports/`,
    );
    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/projects/${teamId}/signal_reports/`,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch signal reports: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      results: data.results ?? data ?? [],
      count: data.count ?? data.results?.length ?? data?.length ?? 0,
    };
  }

  async getSignalReportArtefacts(
    reportId: string,
  ): Promise<SignalReportArtefactsResponse> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/signal_reports/${reportId}/artefacts/`,
    );
    const path = `/api/projects/${teamId}/signal_reports/${reportId}/artefacts/`;

    try {
      const response = await this.api.fetcher.fetch({
        method: "get",
        url,
        path,
      });

      if (!response.ok) {
        const responseText = await response.text();
        const unavailableReason =
          response.status === 403
            ? "forbidden"
            : response.status === 404
              ? "not_found"
              : "request_failed";

        log.warn("Signal report artefacts unavailable", {
          teamId,
          reportId,
          status: response.status,
          statusText: response.statusText,
          body: responseText || undefined,
        });

        return { results: [], count: 0, unavailableReason };
      }

      const data = (await response.json()) as unknown;
      const parsed = parseSignalReportArtefactsPayload(data);

      if (parsed.unavailableReason) {
        log.warn("Signal report artefacts payload did not match schema", {
          teamId,
          reportId,
        });
      }

      return parsed;
    } catch (error) {
      log.warn("Failed to fetch signal report artefacts", {
        teamId,
        reportId,
        error,
      });
      return {
        results: [],
        count: 0,
        unavailableReason: "request_failed",
      };
    }
  }

  async getRepositoryReadiness(
    repository: string,
    options?: { refresh?: boolean; windowDays?: number },
  ): Promise<RepoAutonomyStatus> {
    const teamId = await this.getTeamId();
    const url = new URL(
      `${this.api.baseUrl}/api/projects/${teamId}/tasks/repository_readiness/`,
    );
    url.searchParams.set("repository", repository.toLowerCase());
    if (options?.refresh) {
      url.searchParams.set("refresh", "true");
    }
    if (typeof options?.windowDays === "number") {
      url.searchParams.set("window_days", String(options.windowDays));
    }

    const response = await this.api.fetcher.fetch({
      method: "get",
      url,
      path: `/api/projects/${teamId}/tasks/repository_readiness/`,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch repository readiness: ${response.statusText}`,
      );
    }

    const data = await response.json();
    return {
      repository: data.repository,
      classification: data.classification,
      excluded: data.excluded,
      coreSuggestions: data.coreSuggestions,
      replayInsights: data.replayInsights,
      errorInsights: data.errorInsights,
      overall: data.overall,
      evidenceTaskCount: data.evidenceTaskCount ?? 0,
      windowDays: data.windowDays,
      generatedAt: data.generatedAt,
      cacheAgeSeconds: data.cacheAgeSeconds,
      scan: data.scan,
    } as RepoAutonomyStatus;
  }

  /**
   * Check if a feature flag is enabled for the current project.
   * Returns true if the flag exists and is active, false otherwise.
   */
  async isFeatureFlagEnabled(flagKey: string): Promise<boolean> {
    try {
      const teamId = await this.getTeamId();
      const url = new URL(
        `${this.api.baseUrl}/api/projects/${teamId}/feature_flags/`,
      );
      url.searchParams.set("key", flagKey);

      const response = await this.api.fetcher.fetch({
        method: "get",
        url,
        path: `/api/projects/${teamId}/feature_flags/`,
      });

      if (!response.ok) {
        log.warn(`Failed to fetch feature flags: ${response.statusText}`);
        return false;
      }

      const data = await response.json();
      const flags = data.results ?? data ?? [];
      const flag = flags.find(
        (f: { key: string; active: boolean }) => f.key === flagKey,
      );

      return flag?.active ?? false;
    } catch (error) {
      log.warn(`Error checking feature flag "${flagKey}":`, error);
      return false;
    }
  }
}
