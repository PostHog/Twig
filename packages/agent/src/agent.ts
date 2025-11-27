import { query } from "@anthropic-ai/claude-agent-sdk";
import { ClaudeAdapter } from "./adapters/claude/claude-adapter.js";
import type { ProviderAdapter } from "./adapters/types.js";
import { PostHogFileManager } from "./file-manager.js";
import { GitManager } from "./git-manager.js";
import { PostHogAPIClient } from "./posthog-api.js";
import { PromptBuilder } from "./prompt-builder.js";
import { TaskManager } from "./task-manager.js";
import { TaskProgressReporter } from "./task-progress-reporter.js";
import { TemplateManager } from "./template-manager.js";
import type {
  AgentConfig,
  CanUseTool,
  ExecutionResult,
  Task,
} from "./types.js";
import { Logger } from "./utils/logger.js";
import { TASK_WORKFLOW } from "./workflow/config.js";
import type { WorkflowRuntime } from "./workflow/types.js";

export class Agent {
  private workingDirectory: string;
  private onEvent?: (event: any) => void;
  private taskManager: TaskManager;
  private posthogAPI?: PostHogAPIClient;
  private fileManager: PostHogFileManager;
  private gitManager: GitManager;
  private templateManager: TemplateManager;
  private adapter: ProviderAdapter;
  private logger: Logger;
  private progressReporter: TaskProgressReporter;
  private promptBuilder: PromptBuilder;
  private mcpServers?: Record<string, any>;
  private canUseTool?: CanUseTool;
  public debug: boolean;

  constructor(config: AgentConfig) {
    this.workingDirectory = config.workingDirectory || process.cwd();
    this.onEvent = config.onEvent;
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
    // Hardcode Claude adapter for now - extensible for other providers later
    this.adapter = new ClaudeAdapter();

    this.fileManager = new PostHogFileManager(
      this.workingDirectory,
      this.logger.child("FileManager"),
    );
    this.gitManager = new GitManager({
      repositoryPath: this.workingDirectory,
      logger: this.logger.child("GitManager"),
      // TODO: Add author config from environment or config
    });
    this.templateManager = new TemplateManager();

    if (config.posthogApiUrl && config.posthogApiKey) {
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
    this.progressReporter = new TaskProgressReporter(
      this.posthogAPI,
      this.logger,
    );
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
      const apiKey = this.posthogAPI.getApiKey();

      process.env.ANTHROPIC_BASE_URL = gatewayUrl;
      process.env.ANTHROPIC_AUTH_TOKEN = apiKey;
      this.ensureOpenAIGatewayEnv(gatewayUrl, apiKey);

      this.logger.debug("Configured LLM gateway", { gatewayUrl });
    } catch (error) {
      this.logger.error("Failed to configure LLM gateway", error);
      throw error;
    }
  }

  // Adaptive task execution orchestrated via workflow steps
  async runTask(
    taskOrId: Task | string,
    options: import("./types.js").TaskExecutionOptions = {},
  ): Promise<void> {
    await this._configureLlmGateway();

    const task =
      typeof taskOrId === "string" ? await this.fetchTask(taskOrId) : taskOrId;
    const cwd = options.repositoryPath || this.workingDirectory;
    const isCloudMode = options.isCloudMode ?? false;
    const taskSlug = (task as any).slug || task.id;

    this.logger.info("Starting adaptive task execution", {
      taskId: task.id,
      taskSlug,
      isCloudMode,
    });

    // Initialize progress reporter for task run tracking (needed for PR attachment)
    await this.progressReporter.start(task.id, {
      totalSteps: TASK_WORKFLOW.length,
    });
    this.emitEvent(
      this.adapter.createStatusEvent("run_started", {
        runId: this.progressReporter.runId,
      }),
    );

    await this.prepareTaskBranch(taskSlug, isCloudMode);

    let taskError: Error | undefined;
    try {
      const workflowContext: WorkflowRuntime = {
        task,
        taskSlug,
        cwd,
        isCloudMode,
        options,
        logger: this.logger,
        fileManager: this.fileManager,
        gitManager: this.gitManager,
        promptBuilder: this.promptBuilder,
        progressReporter: this.progressReporter,
        adapter: this.adapter,
        mcpServers: this.mcpServers,
        posthogAPI: this.posthogAPI,
        emitEvent: (event: any) => this.emitEvent(event),
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
        await this.ensurePullRequest(task, workflowContext.stepResults);
      }

      this.logger.info("Task execution complete", { taskId: task.id });
      this.emitEvent(
        this.adapter.createStatusEvent("task_complete", { taskId: task.id }),
      );
    } catch (error) {
      taskError = error instanceof Error ? error : new Error(String(error));
      this.logger.error("Task execution failed", {
        taskId: task.id,
        error: taskError.message,
      });
    } finally {
      if (taskError) {
        await this.progressReporter.fail(taskError);
        // biome-ignore lint/correctness/noUnsafeFinally: we actually want to throw the error
        throw taskError;
      } else {
        await this.progressReporter.complete();
      }
    }
  }

  // Direct prompt execution - still supported for low-level usage
  async run(
    prompt: string,
    options: {
      repositoryPath?: string;
      permissionMode?: import("./types.js").PermissionMode;
      queryOverrides?: Record<string, any>;
      canUseTool?: CanUseTool;
    } = {},
  ): Promise<ExecutionResult> {
    await this._configureLlmGateway();
    const baseOptions: Record<string, any> = {
      model: "claude-sonnet-4-5-20250929",
      cwd: options.repositoryPath || this.workingDirectory,
      permissionMode: (options.permissionMode as any) || "default",
      settingSources: ["local"],
      mcpServers: this.mcpServers,
    };

    // Add canUseTool hook if provided (options take precedence over instance config)
    const canUseTool = options.canUseTool || this.canUseTool;
    if (canUseTool) {
      baseOptions.canUseTool = canUseTool;
    }

    const response = query({
      prompt,
      options: { ...baseOptions, ...(options.queryOverrides || {}) },
    });

    const results = [];
    try {
      for await (const message of response) {
        this.logger.debug("Received message in direct run", message);
        // Emit raw SDK event
        this.emitEvent(this.adapter.createRawSDKEvent(message));
        const transformedEvents = this.adapter.transform(message);
        for (const event of transformedEvents) {
          this.emitEvent(event);
        }
        results.push(message);
      }
    } catch (error) {
      this.logger.error("Error during direct run", error);
      throw error;
    }

    return { results };
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

  async listTasks(filters?: {
    repository?: string;
    organization?: string;
    origin_product?: string;
  }): Promise<Task[]> {
    if (!this.posthogAPI) {
      throw new Error(
        "PostHog API not configured. Provide posthogApiUrl and posthogApiKey in constructor.",
      );
    }
    return this.posthogAPI.listTasks(filters);
  }

  // File system operations for task artifacts
  async writeTaskFile(
    taskId: string,
    fileName: string,
    content: string,
    type: "plan" | "context" | "reference" | "output" = "reference",
  ): Promise<void> {
    this.logger.debug("Writing task file", {
      taskId,
      fileName,
      type,
      contentLength: content.length,
    });
    await this.fileManager.writeTaskFile(taskId, {
      name: fileName,
      content,
      type,
    });
  }

  async readTaskFile(taskId: string, fileName: string): Promise<string | null> {
    this.logger.debug("Reading task file", { taskId, fileName });
    return await this.fileManager.readTaskFile(taskId, fileName);
  }

  async getTaskFiles(taskId: string): Promise<any[]> {
    this.logger.debug("Getting task files", { taskId });
    const files = await this.fileManager.getTaskFiles(taskId);
    this.logger.debug("Found task files", { taskId, fileCount: files.length });
    return files;
  }

  async writePlan(taskId: string, plan: string): Promise<void> {
    this.logger.info("Writing plan", { taskId, planLength: plan.length });
    await this.fileManager.writePlan(taskId, plan);
  }

  async readPlan(taskId: string): Promise<string | null> {
    this.logger.debug("Reading plan", { taskId });
    return await this.fileManager.readPlan(taskId);
  }

  // Git operations for task execution
  async createPlanningBranch(taskId: string): Promise<string> {
    this.logger.info("Creating planning branch", { taskId });
    const branchName = await this.gitManager.createTaskPlanningBranch(taskId);
    this.logger.debug("Planning branch created", { taskId, branchName });
    return branchName;
  }

  async commitPlan(taskId: string, taskTitle: string): Promise<string> {
    this.logger.info("Committing plan", { taskId, taskTitle });
    const commitHash = await this.gitManager.commitPlan(taskId, taskTitle);
    this.logger.debug("Plan committed", { taskId, commitHash });
    return commitHash;
  }

  async createImplementationBranch(
    taskId: string,
    planningBranchName?: string,
  ): Promise<string> {
    this.logger.info("Creating implementation branch", {
      taskId,
      fromBranch: planningBranchName,
    });
    const branchName = await this.gitManager.createTaskImplementationBranch(
      taskId,
      planningBranchName,
    );
    this.logger.debug("Implementation branch created", { taskId, branchName });
    return branchName;
  }

  async commitImplementation(
    taskId: string,
    taskTitle: string,
    planSummary?: string,
  ): Promise<string> {
    this.logger.info("Committing implementation", { taskId, taskTitle });
    const commitHash = await this.gitManager.commitImplementation(
      taskId,
      taskTitle,
      planSummary,
    );
    this.logger.debug("Implementation committed", { taskId, commitHash });
    return commitHash;
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

    if (!this.posthogAPI || !this.progressReporter.runId) {
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

    await this.posthogAPI.updateTaskRun(
      taskId,
      this.progressReporter.runId,
      updates,
    );
    this.logger.debug("PR attached to task run", {
      taskId,
      runId: this.progressReporter.runId,
      prUrl,
    });
  }

  async updateTaskBranch(taskId: string, branchName: string): Promise<void> {
    this.logger.info("Updating task run branch", { taskId, branchName });

    if (!this.posthogAPI || !this.progressReporter.runId) {
      const error = new Error(
        "PostHog API not configured or no active run. Cannot update branch.",
      );
      this.logger.error("PostHog API not configured", error);
      throw error;
    }

    await this.posthogAPI.updateTaskRun(taskId, this.progressReporter.runId, {
      branch: branchName,
    });
    this.logger.debug("Task run branch updated", {
      taskId,
      runId: this.progressReporter.runId,
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
      this.emitEvent(
        this.adapter.createStatusEvent("branch_created", {
          branch: currentBranch,
        }),
      );
      return;
    }

    await this.gitManager.resetToDefaultBranchIfNeeded();

    const existingBranch = await this.gitManager.getTaskBranch(taskSlug);
    if (!existingBranch) {
      const branchName = await this.gitManager.createTaskBranch(taskSlug);
      this.emitEvent(
        this.adapter.createStatusEvent("branch_created", {
          branch: branchName,
        }),
      );

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

    this.emitEvent(this.adapter.createStatusEvent("pr_created", { prUrl }));

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

  private emitEvent(event: any): void {
    if (this.debug && event.type !== "token") {
      // Log all events except tokens (too verbose)
      this.logger.debug("Emitting event", { type: event.type, ts: event.ts });
    }
    const persistPromise = this.progressReporter.recordEvent(event);
    if (persistPromise && typeof persistPromise.then === "function") {
      persistPromise.catch((error: Error) =>
        this.logger.debug("Failed to persist agent event", {
          message: error.message,
        }),
      );
    }
    this.onEvent?.(event);
  }
}

export type {
  AgentConfig,
  ExecutionResult,
  SupportingFile,
  Task,
} from "./types.js";
export { PermissionMode } from "./types.js";
