// import and export to keep a single type file

import type { SessionNotification } from "@agentclientprotocol/sdk";
import type {
  CanUseTool,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
export type { CanUseTool, PermissionResult, SessionNotification };

/**
 * Stored custom notification following ACP extensibility model.
 * Custom notifications use underscore-prefixed methods (e.g., `_posthog/phase_start`).
 * See: https://agentclientprotocol.com/docs/extensibility
 */
export interface StoredNotification {
  type: "notification";
  /** When this notification was stored */
  timestamp: string;
  /** JSON-RPC 2.0 notification (no id field = notification, not request) */
  notification: {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown>;
  };
}

/**
 * Type alias for stored log entries.
 */
export type StoredEntry = StoredNotification;

// PostHog Task model (matches Array's OpenAPI schema)
export interface Task {
  id: string;
  task_number?: number;
  slug?: string;
  title: string;
  description: string;
  origin_product:
    | "error_tracking"
    | "eval_clusters"
    | "user_created"
    | "support_queue"
    | "session_summaries";
  github_integration?: number | null;
  repository: string; // Format: "organization/repository" (e.g., "posthog/posthog-js")
  json_schema?: Record<string, unknown> | null; // JSON schema for task output validation
  created_at: string;
  updated_at: string;
  created_by?: {
    id: number;
    uuid: string;
    distinct_id: string;
    first_name: string;
    email: string;
  };
  latest_run?: TaskRun;
}

// Log entry structure for TaskRun.log

export type ArtifactType =
  | "plan"
  | "context"
  | "reference"
  | "output"
  | "artifact";

export interface TaskRunArtifact {
  name: string;
  type: ArtifactType;
  size?: number;
  content_type?: string;
  storage_path?: string;
  uploaded_at?: string;
}

export type TaskRunStatus =
  | "not_started"
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskRunEnvironment = "local" | "cloud";

// TaskRun model - represents individual execution runs of tasks
export interface TaskRun {
  id: string;
  task: string; // Task ID
  team: number;
  branch: string | null;
  stage: string | null; // Current stage (e.g., 'research', 'plan', 'build')
  environment: TaskRunEnvironment;
  status: TaskRunStatus;
  log_url: string;
  error_message: string | null;
  output: Record<string, unknown> | null; // Structured output (PR URL, commit SHA, etc.)
  state: Record<string, unknown>; // Intermediate run state (defaults to {}, never null)
  artifacts?: TaskRunArtifact[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface SupportingFile {
  name: string;
  content: string;
  type: ArtifactType;
  created_at: string;
}

export interface TaskArtifactUploadPayload {
  name: string;
  type: ArtifactType;
  content: string;
  content_type?: string;
}

export enum PermissionMode {
  PLAN = "plan",
  DEFAULT = "default",
  ACCEPT_EDITS = "acceptEdits",
  BYPASS = "bypassPermissions",
}

export interface ExecutionOptions {
  repositoryPath?: string;
  permissionMode?: PermissionMode;
}

export interface TaskExecutionOptions {
  repositoryPath?: string;
  permissionMode?: PermissionMode;
  isCloudMode?: boolean; // Determines local vs cloud behavior (local pauses after each phase)
  createPR?: boolean; // Whether to create PR after build (defaults to false)
  autoProgress?: boolean;
  queryOverrides?: Record<string, unknown>;
  // Fine-grained permission control (only applied to build phase)
  // See: https://docs.claude.com/en/api/agent-sdk/permissions
  canUseTool?: CanUseTool;
  skipGitBranch?: boolean; // Skip creating a task-specific git branch
  framework?: "claude"; // Agent framework to use (defaults to "claude")
  task?: Task; // Pre-fetched task to avoid redundant API call
  isReconnect?: boolean; // Session recreation - skip RUN_STARTED notification
}

export interface ExecutionResult {
  // biome-ignore lint/suspicious/noExplicitAny: Results array contains varying SDK response types
  results: any[];
}

export interface PlanResult {
  plan: string;
}

export interface TaskExecutionResult {
  task: Task;
  plan?: string;
  executionResult?: ExecutionResult;
}

// MCP Server configuration types (re-exported from Claude SDK for convenience)
export type McpServerConfig =
  | {
      type?: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | {
      type: "sse";
      url: string;
      headers?: Record<string, string>;
    }
  | {
      type: "http";
      url: string;
      headers?: Record<string, string>;
    }
  | {
      type: "sdk";
      name: string;
      // biome-ignore lint/suspicious/noExplicitAny: McpServer instance type from external SDK
      instance?: any;
    };

export type LogLevel = "debug" | "info" | "warn" | "error";

export type OnLogCallback = (
  level: LogLevel,
  scope: string,
  message: string,
  data?: unknown,
) => void;

export interface AgentConfig {
  workingDirectory?: string;

  // PostHog API configuration (optional - enables PostHog integration when provided)
  posthogApiUrl?: string;
  getPosthogApiKey?: () => string;
  posthogProjectId?: number;

  // PostHog MCP configuration
  posthogMcpUrl?: string;

  // MCP Server configuration
  // Additional MCP servers (PostHog MCP is always included by default)
  // You can override the PostHog MCP config by providing mcpServers.posthog
  mcpServers?: Record<string, McpServerConfig>;

  // Logging configuration
  debug?: boolean;
  onLog?: OnLogCallback;

  // Fine-grained permission control for direct run() calls
  // See: https://docs.claude.com/en/api/agent-sdk/permissions
  canUseTool?: CanUseTool;
}

export interface PostHogAPIConfig {
  apiUrl: string;
  getApiKey: () => string;
  projectId: number;
}

// URL mention types
export type ResourceType =
  | "error"
  | "experiment"
  | "insight"
  | "feature_flag"
  | "generic";

export interface PostHogResource {
  type: ResourceType;
  id: string;
  url: string;
  title?: string;
  content: string;
  // biome-ignore lint/suspicious/noExplicitAny: Metadata contains varying resource-specific fields
  metadata?: Record<string, any>;
}

export interface UrlMention {
  url: string;
  type: ResourceType;
  id?: string;
  label?: string;
}

// Worktree types for parallel task development
export type BranchOwnership = "created" | "borrowed";

export interface WorktreeInfo {
  worktreePath: string;
  worktreeName: string;
  branchName: string;
  baseBranch: string;
  createdAt: string;
  branchOwnership: BranchOwnership;
}
