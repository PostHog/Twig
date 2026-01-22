import {
  createAcpConnection,
  type InProcessAcpConnection,
} from "./adapters/acp-connection.js";
import { PostHogAPIClient } from "./posthog-api.js";
import { SessionLogWriter } from "./session-log-writer.js";
import { TreeTracker } from "./tree-tracker.js";
import type {
  AgentConfig,
  AgentMode,
  DeviceInfo,
  TaskExecutionOptions,
  TreeSnapshotEvent,
} from "./types.js";
import { Logger } from "./utils/logger.js";

export class Agent {
  private posthogAPI?: PostHogAPIClient;
  private logger: Logger;
  private acpConnection?: InProcessAcpConnection;
  private sessionLogWriter?: SessionLogWriter;
  private currentRunId?: string;
  private currentTaskId?: string;
  private treeTracker?: TreeTracker;
  private deviceInfo?: DeviceInfo;
  private agentMode: AgentMode = "interactive";
  private isExecutingTool: boolean = false;
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

    const cwd = options.repositoryPath;

    // Use taskRunId as sessionId - they are the same identifier
    this.currentRunId = taskRunId;
    this.currentTaskId = taskId;

    // Initialize TreeTracker for state capture if we have a repository path
    if (cwd) {
      this.treeTracker = new TreeTracker({
        repositoryPath: cwd,
        taskId,
        runId: taskRunId,
        apiClient: this.posthogAPI,
        logger: this.logger.child("TreeTracker"),
      });
    }

    // Set device info for local mode
    this.deviceInfo = {
      id: `local-${process.pid}`,
      type: "local",
      name: process.env.HOSTNAME || process.env.USER || "local",
    };

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

    if (!this.posthogAPI || !this.currentRunId) {
      const error = new Error(
        "PostHog API not configured or no active run. Cannot attach PR to task.",
      );
      this.logger.error("PostHog API not configured", error);
      throw error;
    }

    const updates: Record<string, unknown> = {
      output: { pr_url: prUrl },
    };
    if (branchName) {
      updates.branch = branchName;
    }

    await this.posthogAPI.updateTaskRun(taskId, this.currentRunId, updates);
    this.logger.debug("PR attached to task run", {
      taskId,
      taskRunId: this.currentRunId,
      prUrl,
    });
  }

  async cleanup(): Promise<void> {
    await this.acpConnection?.cleanup();
  }

  /**
   * Stop the agent gracefully, capturing final state.
   * Emits a tree_snapshot event with interrupted flag if mid-tool.
   */
  async stop(): Promise<TreeSnapshotEvent | null> {
    const interrupted = this.isExecutingTool;

    this.logger.info("Stopping agent", {
      interrupted,
      taskId: this.currentTaskId,
      runId: this.currentRunId,
    });

    // Capture tree snapshot immediately
    let snapshot: TreeSnapshotEvent | null = null;
    if (this.treeTracker) {
      const treeSnapshot = await this.treeTracker.captureTree({ interrupted });
      if (treeSnapshot) {
        snapshot = {
          ...treeSnapshot,
          device: this.deviceInfo,
        };

        // Emit tree_snapshot event
        await this.emitTreeSnapshot(snapshot);
      }
    }

    // Flush session log writer
    if (this.sessionLogWriter && this.currentRunId) {
      await this.sessionLogWriter.flush(this.currentRunId);
    }

    this.logger.info("Agent stopped", {
      hasSnapshot: !!snapshot,
      interrupted,
    });

    return snapshot;
  }

  /**
   * Emit a tree_snapshot event to the log.
   */
  private async emitTreeSnapshot(snapshot: TreeSnapshotEvent): Promise<void> {
    if (!this.acpConnection) return;

    await this.acpConnection.agentConnection.extNotification?.(
      "_posthog/tree_snapshot",
      snapshot as unknown as Record<string, unknown>,
    );
  }

  /**
   * Set device info for tracking where work happens.
   */
  setDeviceInfo(info: DeviceInfo): void {
    this.deviceInfo = info;
  }

  /**
   * Get current device info.
   */
  getDeviceInfo(): DeviceInfo | undefined {
    return this.deviceInfo;
  }

  /**
   * Set agent mode (interactive or background).
   */
  setAgentMode(mode: AgentMode): void {
    const previousMode = this.agentMode;
    this.agentMode = mode;

    if (previousMode !== mode && this.acpConnection) {
      this.acpConnection.agentConnection.extNotification?.(
        "_posthog/mode_change",
        { mode, previous_mode: previousMode },
      );
    }
  }

  /**
   * Get current agent mode.
   */
  getAgentMode(): AgentMode {
    return this.agentMode;
  }

  /**
   * Mark tool execution started/ended (used by stop() to determine interrupted state).
   */
  setToolExecuting(executing: boolean): void {
    this.isExecutingTool = executing;
  }

  /**
   * Get the tree tracker instance.
   */
  getTreeTracker(): TreeTracker | undefined {
    return this.treeTracker;
  }
}
