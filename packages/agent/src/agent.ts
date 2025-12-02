import { v7 as uuidv7 } from "uuid";
import { POSTHOG_NOTIFICATIONS } from "./acp-extensions.js";
import {
  createAcpConnection,
  type InProcessAcpConnection,
} from "./adapters/claude/claude.js";
import { PostHogFileManager } from "./file-manager.js";
import { GitManager } from "./git-manager.js";
import { PostHogAPIClient } from "./posthog-api.js";
import { PromptBuilder } from "./prompt-builder.js";
import { TaskManager } from "./task-manager.js";
import { TemplateManager } from "./template-manager.js";
import type { AgentConfig, CanUseTool, Task } from "./types.js";
import { Logger } from "./utils/logger.js";
import { TASK_WORKFLOW } from "./workflow/config.js";
import type { SendNotification, WorkflowRuntime } from "./workflow/types.js";

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
  private currentSessionId?: string;
  private currentRunId?: string;
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
    if (config.posthogApiKey) {
      headers.Authorization = `Bearer ${config.posthogApiKey}`;
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

    if (config.posthogApiUrl && config.posthogApiKey && config.posthogProjectId) {
      this.posthogAPI = new PostHogAPIClient({
        apiUrl: config.posthogApiUrl,
        apiKey: config.posthogApiKey,
        projectId: config.posthogProjectId,
      });
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
   * Configure LLM gateway environment variables for Claude Code CLI
   */
  private async _configureLlmGateway(): Promise<void> {
    if (!this.posthogAPI) {
      return;
    }

    try {
      const gatewayUrl = this.posthogAPI.getLlmGatewayUrl();
      this.logger.info("Gateway URL", { gatewayUrl });
      const apiKey = this.posthogAPI.getApiKey();
      this.logger.info("API Key", { apiKey });

      process.env.ANTHROPIC_BASE_URL = gatewayUrl;
      process.env.ANTHROPIC_AUTH_TOKEN = apiKey;
      this.ensureOpenAIGatewayEnv(gatewayUrl, apiKey);

      this.logger.info("Configured LLM gateway", { gatewayUrl });
    } catch (error) {
      this.logger.error("Failed to configure LLM gateway", error);
      throw error;
    }
  }

  private getOrCreateConnection(): InProcessAcpConnection {
    if (!this.acpConnection) {
      this.acpConnection = createAcpConnection();
    }
    return this.acpConnection;
  }

  // Adaptive task execution orchestrated via workflow steps
  async runTask(
    taskId: string,
    taskRunId: string,
    options: import("./types.js").TaskExecutionOptions = {},
  ): Promise<void> {
    // await this._configureLlmGateway();

    const task = await this.fetchTask(taskId);
    const cwd = options.repositoryPath || this.workingDirectory;
    const isCloudMode = options.isCloudMode ?? false;
    const taskSlug = (task as any).slug || task.id;

    // Create a session for this task run
    const sessionId = uuidv7();
    this.currentSessionId = sessionId;
    this.currentRunId = taskRunId;

    this.logger.info("Starting adaptive task execution", {
      taskId: task.id,
      taskSlug,
      taskRunId,
      sessionId,
      isCloudMode,
    });

    const connection = this.getOrCreateConnection();

    // Create sendNotification using ACP connection's extNotification
    const sendNotification: SendNotification = async (method, params) => {
      this.logger.debug(`Notification: ${method}`, params);
      await connection.agentConnection.extNotification?.(method, params);
    };

    await sendNotification(POSTHOG_NOTIFICATIONS.RUN_STARTED, {
      sessionId,
      runId: taskRunId,
    });

    await this.prepareTaskBranch(taskSlug, isCloudMode, sendNotification);

    let taskError: Error | undefined;
    try {
      const workflowContext: WorkflowRuntime = {
        task,
        taskSlug,
        runId: taskRunId,
        cwd,
        isCloudMode,
        options,
        logger: this.logger,
        fileManager: this.fileManager,
        gitManager: this.gitManager,
        promptBuilder: this.promptBuilder,
        connection: connection.agentConnection,
        sessionId,
        sendNotification,
        mcpServers: this.mcpServers,
        posthogAPI: this.posthogAPI,
        stepResults: {},
      };

      for (const step of TASK_WORKFLOW) {
        const result = await step.run({ step, context: workflowContext });
        if (result.halt) {
          return;
        }
      }

      const shouldCreatePR = options.createPR ?? isCloudMode;
      if (shouldCreatePR) {
        await this.ensurePullRequest(task, workflowContext.stepResults, sendNotification);
      }

      this.logger.info("Task execution complete", { taskId: task.id });
      await sendNotification(POSTHOG_NOTIFICATIONS.TASK_COMPLETE, {
        sessionId,
        taskId: task.id,
      });
    } catch (error) {
      taskError = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Task execution failed", {
        taskId: task.id,
        error: taskError.message,
      });
      await sendNotification(POSTHOG_NOTIFICATIONS.ERROR, {
        sessionId,
        message: taskError.message,
      });
      throw taskError;
    }
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

    const task = await this.fetchTask(taskId);
    const taskSlug = (task as any).slug || task.id;
    const isCloudMode = options.isCloudMode ?? false;
    const cwd = options.repositoryPath || this.workingDirectory;

    const sessionId = uuidv7();
    this.currentSessionId = sessionId;
    this.currentRunId = taskRunId;

    this.logger.info("Starting task session", {
      taskId: task.id,
      taskSlug,
      taskRunId,
      sessionId,
      cwd,
    });

    this.acpConnection = createAcpConnection();

    const sendNotification: SendNotification = async (method, params) => {
      this.logger.debug(`Notification: ${method}`, params);
      await this.acpConnection?.agentConnection.extNotification?.(method, params);
    };

    await sendNotification(POSTHOG_NOTIFICATIONS.RUN_STARTED, {
      sessionId,
      runId: taskRunId,
    });

    if (!options.skipGitBranch) {
      try {
        await this.prepareTaskBranch(taskSlug, isCloudMode, sendNotification);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error("Failed to prepare task branch", { error: errorMessage });
        await sendNotification(POSTHOG_NOTIFICATIONS.ERROR, {
          sessionId,
          message: errorMessage,
        });
        throw error;
      }
    } else {
      this.logger.info("Skipping git branch creation");
    }

    return this.acpConnection;
  }

  // PostHog task operations
  async fetchTask(taskId: string): Promise<Task> {
    this.logger.debug("Fetching task from PostHog", { taskId });
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
This PR implements the changes described in the task.

Generated by PostHog Agent`;
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

  private async ensurePullRequest(
    task: Task,
    stepResults: Record<string, any>,
    sendNotification: SendNotification,
  ): Promise<void> {
    const latestRun = task.latest_run;
    const existingPr =
      latestRun?.output && typeof latestRun.output === "object"
        ? (latestRun.output as any).pr_url
        : null;

    if (existingPr) {
      this.logger.info("PR already exists, skipping creation", {
        taskId: task.id,
        prUrl: existingPr,
      });
      return;
    }

    const buildResult = stepResults.build;
    if (!buildResult?.commitCreated) {
      this.logger.warn(
        "Build step did not produce a commit; skipping PR creation",
        { taskId: task.id },
      );
      return;
    }

    const branchName = await this.gitManager.getCurrentBranch();
    const finalizeResult = stepResults.finalize;
    const prBody = finalizeResult?.prBody;

    const prUrl = await this.createPullRequest(
      task.id,
      branchName,
      task.title,
      task.description ?? "",
      prBody,
    );

    await sendNotification(POSTHOG_NOTIFICATIONS.PR_CREATED, { prUrl });

    try {
      await this.attachPullRequestToTask(task.id, prUrl, branchName);
      this.logger.info("PR attached to task successfully", {
        taskId: task.id,
        prUrl,
      });
    } catch (error) {
      this.logger.warn("Could not attach PR to task", {
        error: error instanceof Error ? error.message : String(error),
      });
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
