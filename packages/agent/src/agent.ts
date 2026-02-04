import {
  createAcpConnection,
  type InProcessAcpConnection,
} from "./adapters/acp-connection.js";
import { BLOCKED_MODELS, DEFAULT_GATEWAY_MODEL } from "./gateway-models.js";
import { PostHogAPIClient } from "./posthog-api.js";
import { SessionLogWriter } from "./session-log-writer.js";
import type { AgentConfig, TaskExecutionOptions } from "./types.js";
import { Logger } from "./utils/logger.js";

export class Agent {
  private posthogAPI?: PostHogAPIClient;
  private logger: Logger;
  private acpConnection?: InProcessAcpConnection;
  private taskRunId?: string;
  private sessionLogWriter?: SessionLogWriter;
  public debug: boolean;

  constructor(config: AgentConfig) {
    this.debug = config.debug || false;
    this.logger = new Logger({
      debug: this.debug,
      prefix: "[PostHog Agent]",
      onLog: config.onLog,
    });

    if (config.posthog) {
      this.posthogAPI = new PostHogAPIClient(config.posthog);
      this.sessionLogWriter = new SessionLogWriter(
        this.posthogAPI,
        this.logger.child("SessionLogWriter"),
      );
    }
  }

  private _configureLlmGateway(_adapter?: "claude" | "codex"): {
    gatewayUrl: string;
    apiKey: string;
  } | null {
    if (!this.posthogAPI) {
      return null;
    }

    try {
      const gatewayUrl = this.posthogAPI.getLlmGatewayUrl();
      const apiKey = this.posthogAPI.getApiKey();

      process.env.OPENAI_BASE_URL = `${gatewayUrl}/v1`;
      process.env.OPENAI_API_KEY = apiKey;
      process.env.ANTHROPIC_BASE_URL = gatewayUrl;
      process.env.ANTHROPIC_AUTH_TOKEN = apiKey;

      return { gatewayUrl, apiKey };
    } catch (error) {
      this.logger.error("Failed to configure LLM gateway", error);
      throw error;
    }
  }

  async run(
    taskId: string,
    taskRunId: string,
    options: TaskExecutionOptions = {},
  ): Promise<InProcessAcpConnection> {
    const gatewayConfig = this._configureLlmGateway(options.adapter);

    this.taskRunId = taskRunId;

    const sanitizedModel =
      options.model && !BLOCKED_MODELS.has(options.model)
        ? options.model
        : DEFAULT_GATEWAY_MODEL;

    this.acpConnection = createAcpConnection({
      adapter: options.adapter,
      logWriter: this.sessionLogWriter,
      taskRunId,
      taskId,
      logger: this.logger,
      processCallbacks: options.processCallbacks,
      codexOptions:
        options.adapter === "codex" && gatewayConfig
          ? {
              cwd: options.repositoryPath,
              apiBaseUrl: `${gatewayConfig.gatewayUrl}/v1`,
              apiKey: gatewayConfig.apiKey,
              binaryPath: options.codexBinaryPath,
              model: sanitizedModel,
            }
          : undefined,
    });

    return this.acpConnection;
  }

  async attachPullRequestToTask(
    taskId: string,
    prUrl: string,
    branchName?: string,
  ): Promise<void> {
    this.logger.info("Attaching PR to task run", { taskId, prUrl, branchName });

    if (!this.posthogAPI || !this.taskRunId) {
      const error = new Error(
        "PostHog API not configured or no active run. Cannot attach PR to task.",
      );
      this.logger.error("PostHog API not configured", error);
      throw error;
    }

    const updates: any = {
      output: { pr_url: prUrl },
    };
    if (branchName) {
      updates.branch = branchName;
    }

    await this.posthogAPI.updateTaskRun(taskId, this.taskRunId, updates);
    this.logger.debug("PR attached to task run", {
      taskId,
      taskRunId: this.taskRunId,
      prUrl,
    });
  }

  async flushAllLogs(): Promise<void> {
    await this.sessionLogWriter?.flushAll();
  }

  async cleanup(): Promise<void> {
    if (this.sessionLogWriter && this.taskRunId) {
      await this.sessionLogWriter.flush(this.taskRunId);
    }
    await this.acpConnection?.cleanup();
  }
}
