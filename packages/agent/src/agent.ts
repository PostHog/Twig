import {
  type Client,
  ClientSideConnection,
  type ContentBlock,
  ndJsonStream,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import { POSTHOG_NOTIFICATIONS } from "./acp-extensions.js";
import {
  createAcpConnection,
  type InProcessAcpConnection,
} from "./adapters/connection.js";
import { PostHogFileManager } from "./file-manager.js";
import { GitManager } from "./git-manager.js";
import { PostHogAPIClient } from "./posthog-api.js";
import { PromptBuilder } from "./prompt-builder.js";
import { SessionStore } from "./session-store.js";
import { TaskManager } from "./task-manager.js";
import { TemplateManager } from "./template-manager.js";
import type {
  AgentConfig,
  CanUseTool,
  StoredNotification,
  Task,
  TaskExecutionOptions,
} from "./types.js";
import { Logger } from "./utils/logger.js";

/**
 * Type for sending ACP notifications
 */
type SendNotification = (
  method: string,
  params: Record<string, unknown>,
) => Promise<void>;

export class Agent {
  private workingDirectory: string;
  private taskManager: TaskManager;
  private posthogAPI?: PostHogAPIClient;
  private fileManager: PostHogFileManager;
  private gitManager: GitManager;
  private templateManager: TemplateManager;
  private logger: Logger;
  private acpConnection?: InProcessAcpConnection;
  private promptBuilder: PromptBuilder;
  private mcpServers?: Record<string, any>;
  private canUseTool?: CanUseTool;
  private currentRunId?: string;
  private sessionStore?: SessionStore;
  public debug: boolean;

  constructor(config: AgentConfig) {
    this.workingDirectory = config.workingDirectory || process.cwd();
    this.canUseTool = config.canUseTool;
    this.debug = config.debug || false;

    // Build default PostHog MCP server configuration
    const posthogMcpUrl =
      config.posthogMcpUrl ||
      process.env.POSTHOG_MCP_URL ||
      "https://mcp.posthog.com/mcp";

    // Add auth if API key provided
    const headers: Record<string, string> = {};
    if (config.getPosthogApiKey) {
      headers.Authorization = `Bearer ${config.getPosthogApiKey()}`;
    }

    const defaultMcpServers = {
      posthog: {
        type: "http" as const,
        url: posthogMcpUrl,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      },
    };

    // Merge default PostHog MCP with user-provided servers (user config takes precedence)
    this.mcpServers = {
      ...defaultMcpServers,
      ...config.mcpServers,
    };
    this.logger = new Logger({
      debug: this.debug,
      prefix: "[PostHog Agent]",
      onLog: config.onLog,
    });
    this.taskManager = new TaskManager();

    this.fileManager = new PostHogFileManager(
      this.workingDirectory,
      this.logger.child("FileManager"),
    );
    this.gitManager = new GitManager({
      repositoryPath: this.workingDirectory,
      logger: this.logger.child("GitManager"),
    });
    this.templateManager = new TemplateManager();

    if (
      config.posthogApiUrl &&
      config.getPosthogApiKey &&
      config.posthogProjectId
    ) {
      this.posthogAPI = new PostHogAPIClient({
        apiUrl: config.posthogApiUrl,
        getApiKey: config.getPosthogApiKey,
        projectId: config.posthogProjectId,
      });

      // Create SessionStore from the API client for ACP connection
      this.sessionStore = new SessionStore(
        this.posthogAPI,
        this.logger.child("SessionStore"),
      );
    }

    this.promptBuilder = new PromptBuilder({
      getTaskFiles: (taskId: string) => this.getTaskFiles(taskId),
      generatePlanTemplate: (vars) => this.templateManager.generatePlan(vars),
      posthogClient: this.posthogAPI,
      logger: this.logger.child("PromptBuilder"),
    });
  }

  /**
   * Enable or disable debug logging
   */
  setDebug(enabled: boolean) {
    this.debug = enabled;
    this.logger.setDebug(enabled);
  }

  /**
   * Configure LLM gateway environment variables for Claude Code CLI.
   */
  private async _configureLlmGateway(): Promise<void> {
    if (!this.posthogAPI) {
      return;
    }

    try {
      const gatewayUrl = this.posthogAPI.getLlmGatewayUrl();
      const apiKey = this.posthogAPI.getApiKey();
      process.env.ANTHROPIC_BASE_URL = gatewayUrl;
      process.env.ANTHROPIC_AUTH_TOKEN = apiKey;
      this.ensureOpenAIGatewayEnv(gatewayUrl, apiKey);
      this.ensureGeminiGatewayEnv(gatewayUrl, apiKey);
    } catch (error) {
      this.logger.error("Failed to configure LLM gateway", error);
      throw error;
    }
  }

  private getOrCreateConnection(): InProcessAcpConnection {
    if (!this.acpConnection) {
      this.acpConnection = createAcpConnection({
        sessionStore: this.sessionStore,
      });
    }
    return this.acpConnection;
  }

  /**
   * @deprecated Use runTaskV2() for local execution or runTaskCloud() for cloud execution.
   * This method used the old workflow system which has been removed.
   */
  async runTask(
    _taskId: string,
    _taskRunId: string,
    _options: import("./types.js").TaskExecutionOptions = {},
  ): Promise<void> {
    throw new Error(
      "runTask() is deprecated. Use runTaskV2() for local execution or runTaskCloud() for cloud execution.",
    );
  }

  /**
   * Creates an in-process ACP connection for client communication.
   * Sets up git branch for the task, configures LLM gateway.
   * The client handles all prompting/querying via the returned streams.
   *
   * @returns InProcessAcpConnection with clientStreams for the client to use
   */
  async runTaskV2(
    taskId: string,
    taskRunId: string,
    options: import("./types.js").TaskExecutionOptions = {},
  ): Promise<InProcessAcpConnection> {
    await this._configureLlmGateway();

    const isCloudMode = options.isCloudMode ?? false;
    const _cwd = options.repositoryPath || this.workingDirectory;

    // Use taskRunId as sessionId - they are the same identifier
    this.currentRunId = taskRunId;

    this.acpConnection = createAcpConnection({
      framework: options.framework,
      sessionStore: this.sessionStore,
      sessionId: taskRunId,
      taskId,
    });

    const sendNotification: SendNotification = async (method, params) => {
      this.logger.debug(`Notification: ${method}`, params);
      await this.acpConnection?.agentConnection.extNotification?.(
        method,
        params,
      );
    };

    await sendNotification(POSTHOG_NOTIFICATIONS.RUN_STARTED, {
      sessionId: taskRunId,
      runId: taskRunId,
    });

    // Only fetch task when we need the slug for git branch creation
    if (!options.skipGitBranch) {
      const task = options.task ?? (await this.fetchTask(taskId));
      const taskSlug = (task as any).slug || task.id;
      try {
        await this.prepareTaskBranch(taskSlug, isCloudMode, sendNotification);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error("Failed to prepare task branch", {
          error: errorMessage,
        });
        await sendNotification(POSTHOG_NOTIFICATIONS.ERROR, {
          sessionId: taskRunId,
          message: errorMessage,
        });
        throw error;
      }
    }

    return this.acpConnection;
  }

  // PostHog task operations
  async fetchTask(taskId: string): Promise<Task> {
    if (!this.posthogAPI) {
      const error = new Error(
        "PostHog API not configured. Provide posthogApiUrl and posthogApiKey in constructor.",
      );
      this.logger.error("PostHog API not configured", error);
      throw error;
    }
    return this.posthogAPI.fetchTask(taskId);
  }

  getPostHogClient(): PostHogAPIClient | undefined {
    return this.posthogAPI;
  }

  /**
   * Send a notification to a cloud task run's S3 log.
   * The cloud runner will pick up new notifications via interrupt polling.
   */
  async sendNotification(
    taskId: string,
    runId: string,
    notification: StoredNotification,
  ): Promise<void> {
    if (!this.posthogAPI) {
      throw new Error(
        "PostHog API not configured. Cannot send notification to cloud task.",
      );
    }

    await this.posthogAPI.appendTaskRunLog(taskId, runId, [notification]);
    this.logger.debug("Notification sent to cloud task", {
      taskId,
      runId,
      method: notification.notification.method,
    });
  }

  async getTaskFiles(taskId: string): Promise<any[]> {
    this.logger.debug("Getting task files", { taskId });
    const files = await this.fileManager.getTaskFiles(taskId);
    this.logger.debug("Found task files", { taskId, fileCount: files.length });
    return files;
  }

  async createPullRequest(
    taskId: string,
    branchName: string,
    taskTitle: string,
    taskDescription: string,
    customBody?: string,
  ): Promise<string> {
    this.logger.info("Creating pull request", {
      taskId,
      branchName,
      taskTitle,
    });

    const defaultBody = `## Task Details
**Task ID**: ${taskId}
**Description**: ${taskDescription}

## Changes
This PR implements the changes described in the task.`;
    const prBody = customBody || defaultBody;

    const prUrl = await this.gitManager.createPullRequest(
      branchName,
      taskTitle,
      prBody,
    );

    this.logger.info("Pull request created", { taskId, prUrl });
    return prUrl;
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

    const updates: any = {
      output: { pr_url: prUrl },
    };
    if (branchName) {
      updates.branch = branchName;
    }

    await this.posthogAPI.updateTaskRun(taskId, this.currentRunId, updates);
    this.logger.debug("PR attached to task run", {
      taskId,
      runId: this.currentRunId,
      prUrl,
    });
  }

  async updateTaskBranch(taskId: string, branchName: string): Promise<void> {
    this.logger.info("Updating task run branch", { taskId, branchName });

    if (!this.posthogAPI || !this.currentRunId) {
      const error = new Error(
        "PostHog API not configured or no active run. Cannot update branch.",
      );
      this.logger.error("PostHog API not configured", error);
      throw error;
    }

    await this.posthogAPI.updateTaskRun(taskId, this.currentRunId, {
      branch: branchName,
    });
    this.logger.debug("Task run branch updated", {
      taskId,
      runId: this.currentRunId,
      branchName,
    });
  }

  // Execution management
  cancelTask(taskId: string): void {
    // Find the execution for this task and cancel it
    for (const [executionId, execution] of this.taskManager.executionStates) {
      if (execution.taskId === taskId && execution.status === "running") {
        this.taskManager.cancelExecution(executionId);
        break;
      }
    }
  }

  getTaskExecutionStatus(taskId: string): string | null {
    // Find the execution for this task
    for (const execution of this.taskManager.executionStates.values()) {
      if (execution.taskId === taskId) {
        return execution.status;
      }
    }
    return null;
  }

  private async prepareTaskBranch(
    taskSlug: string,
    isCloudMode: boolean,
    sendNotification: SendNotification,
  ): Promise<void> {
    if (await this.gitManager.hasChanges()) {
      throw new Error(
        "Cannot start task with uncommitted changes. Please commit or stash your changes first.",
      );
    }

    // If we're running in a worktree, we're already on the correct branch
    // (the worktree was created with its own branch). Skip branch creation.
    const isWorktree = await this.gitManager.isWorktree();
    if (isWorktree) {
      const currentBranch = await this.gitManager.getCurrentBranch();
      this.logger.info("Running in worktree, using existing branch", {
        branch: currentBranch,
      });
      await sendNotification(POSTHOG_NOTIFICATIONS.BRANCH_CREATED, {
        branch: currentBranch,
      });
      return;
    }

    await this.gitManager.resetToDefaultBranchIfNeeded();

    const existingBranch = await this.gitManager.getTaskBranch(taskSlug);
    if (!existingBranch) {
      const branchName = await this.gitManager.createTaskBranch(taskSlug);
      await sendNotification(POSTHOG_NOTIFICATIONS.BRANCH_CREATED, {
        branch: branchName,
      });

      await this.gitManager.addAllPostHogFiles();

      // Only commit if there are changes or we're in cloud mode
      if (isCloudMode) {
        await this.gitManager.commitAndPush(`Initialize task ${taskSlug}`, {
          allowEmpty: true,
        });
      } else {
        // Check if there are any changes before committing
        const hasChanges = await this.gitManager.hasStagedChanges();
        if (hasChanges) {
          await this.gitManager.commitChanges(`Initialize task ${taskSlug}`);
        }
      }
    } else {
      this.logger.info("Switching to existing task branch", {
        branch: existingBranch,
      });
      await this.gitManager.switchToBranch(existingBranch);
    }
  }

  private ensureOpenAIGatewayEnv(gatewayUrl?: string, token?: string): void {
    const resolvedGatewayUrl = gatewayUrl || process.env.ANTHROPIC_BASE_URL;
    const resolvedToken = token || process.env.ANTHROPIC_AUTH_TOKEN;

    if (resolvedGatewayUrl) {
      process.env.OPENAI_BASE_URL = resolvedGatewayUrl;
    }

    if (resolvedToken) {
      process.env.OPENAI_API_KEY = resolvedToken;
    }
  }

  private ensureGeminiGatewayEnv(gatewayUrl?: string, token?: string): void {
    const resolvedGatewayUrl = gatewayUrl || process.env.ANTHROPIC_BASE_URL;
    const resolvedToken = token || process.env.ANTHROPIC_AUTH_TOKEN;

    if (resolvedGatewayUrl) {
      process.env.GEMINI_BASE_URL = resolvedGatewayUrl;
    }

    if (resolvedToken) {
      process.env.GEMINI_API_KEY = resolvedToken;
    }
  }

  async runTaskCloud(
    taskId: string,
    taskRunId: string,
    options: TaskExecutionOptions = {},
  ): Promise<void> {
    await this._configureLlmGateway();

    const task = await this.fetchTask(taskId);
    const cwd = options.repositoryPath || this.workingDirectory;
    const taskSlug = (task as any).slug || task.id;

    this.currentRunId = taskRunId;

    this.logger.info("Starting cloud task execution", {
      taskId: task.id,
      taskSlug,
      taskRunId,
      cwd,
    });

    if (!this.sessionStore) {
      throw new Error(
        "SessionStore required for cloud mode. Ensure PostHog API credentials are configured.",
      );
    }

    // Start session in SessionStore (updates task run status to in_progress)
    const taskRun = await this.sessionStore.start(taskRunId, taskId, taskRunId);
    this.logger.debug("Session started", {
      taskRunId,
      logUrl: taskRun?.log_url,
    });

    // Create internal ACP connection with S3 persistence
    const acpConnection = createAcpConnection({
      sessionStore: this.sessionStore,
      sessionId: taskRunId,
      taskId: task.id,
    });

    // Create client connection using the client-side streams
    const clientStream = ndJsonStream(
      acpConnection.clientStreams.writable as WritableStream<Uint8Array>,
      acpConnection.clientStreams.readable as ReadableStream<Uint8Array>,
    );

    // Create auto-approving client for headless cloud mode
    const cloudClient: Client = {
      async requestPermission(params) {
        const allowOption = params.options.find(
          (o) => o.kind === "allow_once" || o.kind === "allow_always",
        );
        return {
          outcome: {
            outcome: "selected",
            optionId: allowOption?.optionId ?? params.options[0].optionId,
          },
        };
      },
      async sessionUpdate(_params) {
        // Notifications are already being persisted to S3 via tapped streams
      },
    };

    const clientConnection = new ClientSideConnection(
      (_agent) => cloudClient,
      clientStream,
    );

    try {
      // Initialize the connection
      await clientConnection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      });

      // Create new session
      await clientConnection.newSession({
        cwd,
        mcpServers: [],
        _meta: { sessionId: taskRunId },
      });

      // Prepare git branch if not skipped
      if (!options.skipGitBranch) {
        const sendNotification: SendNotification = async (method, params) => {
          this.logger.debug(`Notification: ${method}`, params);
          await acpConnection.agentConnection.extNotification?.(method, params);
        };
        await this.prepareTaskBranch(taskSlug, true, sendNotification);
      }

      // Build initial prompt from task description
      const initialPrompt: ContentBlock[] = [
        {
          type: "text",
          text: `# Task: ${task.title}\n\n${task.description}`,
        },
      ];

      // Track the last known log entry count for interrupt polling
      let lastKnownEntryCount = 0;
      let isPolling = true;

      // Start interrupt polling in background
      const pollForInterrupts = async () => {
        while (isPolling) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Poll every 2 seconds
          if (!isPolling) break;

          try {
            const newEntries = await this.sessionStore?.pollForNewEntries(
              taskRunId,
              lastKnownEntryCount,
            );

            for (const entry of newEntries ?? []) {
              lastKnownEntryCount++;
              // Look for user_message notifications
              if (
                entry.notification?.method === "sessionUpdate" &&
                (entry.notification?.params as any)?.sessionUpdate ===
                  "user_message"
              ) {
                const content = (entry.notification?.params as any)?.content;
                if (content) {
                  this.logger.info("Processing user interrupt", { content });
                  // Send as new prompt - will be processed after current prompt completes
                  await clientConnection.prompt({
                    sessionId: taskRunId,
                    prompt: Array.isArray(content) ? content : [content],
                  });
                }
              }
            }
          } catch (err) {
            this.logger.warn("Interrupt polling error", { error: err });
          }
        }
      };

      // Start polling in background (don't await)
      const pollingPromise = pollForInterrupts();

      // Send initial prompt and wait for completion
      this.logger.info("Sending initial prompt to agent");
      const result = await clientConnection.prompt({
        sessionId: taskRunId,
        prompt: initialPrompt,
      });

      // Stop interrupt polling
      isPolling = false;
      await pollingPromise;

      this.logger.info("Task execution complete", {
        taskId: task.id,
        stopReason: result.stopReason,
      });

      const branchName = await this.gitManager.getCurrentBranch();
      const hasChanges = await this.gitManager.hasChanges();
      const shouldCreatePR = options.createPR ?? false;

      if (hasChanges) {
        this.logger.info("Committing uncommitted changes", { taskId: task.id });
        await this.gitManager.commitImplementation(
          task.id,
          task.title,
          task.description ?? undefined,
        );
      }

      const defaultBranch = await this.gitManager.getDefaultBranch();
      if (branchName !== defaultBranch) {
        this.logger.info("Pushing branch", { branchName, taskId: task.id });
        await this.gitManager.pushBranch(branchName);

        if (shouldCreatePR) {
          this.logger.info("Creating PR", { branchName, taskId: task.id });

          const prUrl = await this.createPullRequest(
            task.id,
            branchName,
            task.title,
            task.description ?? "",
          );

          this.logger.info("PR created", { prUrl, taskId: task.id });

          try {
            await this.attachPullRequestToTask(task.id, prUrl, branchName);
          } catch (err) {
            this.logger.warn("Could not attach PR to task", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      await this.sessionStore.complete(taskRunId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error("Cloud task execution failed", {
        taskId: task.id,
        error: errorMessage,
      });
      await this.sessionStore.fail(taskRunId, errorMessage);
      throw error;
    }
  }

}

export type {
  AgentConfig,
  ExecutionResult,
  SupportingFile,
  Task,
} from "./types.js";
export { PermissionMode } from "./types.js";
