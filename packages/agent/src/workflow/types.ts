import type { AgentSideConnection } from "@agentclientprotocol/sdk";
import type { PostHogFileManager } from "../file-manager.js";
import type { GitManager } from "../git-manager.js";
import type { PostHogAPIClient } from "../posthog-api.js";
import type { PromptBuilder } from "../prompt-builder.js";
import type { PermissionMode, Task, TaskExecutionOptions } from "../types.js";
import type { Logger } from "../utils/logger.js";

/**
 * Function type for sending custom PostHog notifications via ACP extNotification.
 * Used by workflow steps to emit artifacts, phase updates, etc.
 */
export type SendNotification = (
  method: string,
  params: Record<string, unknown>,
) => Promise<void>;

export interface WorkflowRuntime {
  task: Task;
  taskSlug: string;
  runId: string;
  cwd: string;
  isCloudMode: boolean;
  options: TaskExecutionOptions;
  logger: Logger;
  fileManager: PostHogFileManager;
  gitManager: GitManager;
  promptBuilder: PromptBuilder;
  connection: AgentSideConnection;
  sessionId: string;
  mcpServers?: Record<string, unknown>;
  posthogAPI?: PostHogAPIClient;
  sendNotification: SendNotification;
  stepResults: Record<string, unknown>;
}

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  agent: string;
  model: string;
  permissionMode?: PermissionMode | string;
  commit?: boolean;
  push?: boolean;
  run: WorkflowStepRunner;
}

export interface WorkflowStepRuntime {
  step: WorkflowStepDefinition;
  context: WorkflowRuntime;
}

export interface WorkflowStepResult {
  status: "completed" | "skipped";
  halt?: boolean;
}

export type WorkflowStepRunner = (
  runtime: WorkflowStepRuntime,
) => Promise<WorkflowStepResult>;

export type WorkflowDefinition = WorkflowStepDefinition[];
