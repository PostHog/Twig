import {
  createAcpConnection,
  type InProcessAcpConnection,
} from "./adapters/acp-connection.js";
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

  private async _configureLlmGateway(): Promise<void> {
    if (!this.posthogAPI) {
      return;
    }

    try {
      const gatewayUrl = this.posthogAPI.getLlmGatewayUrl();
      const apiKey = this.posthogAPI.getApiKey();
      process.env.ANTHROPIC_BASE_URL = gatewayUrl;
      process.env.ANTHROPIC_AUTH_TOKEN = apiKey;
      process.env.OPENAI_BASE_URL = gatewayUrl;
      process.env.OPENAI_API_KEY = apiKey;
      process.env.GEMINI_BASE_URL = gatewayUrl;
      process.env.GEMINI_API_KEY = apiKey;
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
    await this._configureLlmGateway();

    this.taskRunId = taskRunId;

    this.acpConnection = createAcpConnection({
      adapter: options.adapter,
      logWriter: this.sessionLogWriter,
      sessionId: taskRunId,
      taskId,
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

  async cleanup(): Promise<void> {
    await this.acpConnection?.cleanup();
  }
}
