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

// PostHog Task model (matches Twig's OpenAPI schema)
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
  | "artifact"
  | "tree_snapshot";

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

export interface TaskExecutionOptions {
  repositoryPath?: string;
  adapter?: "claude";
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export type OnLogCallback = (
  level: LogLevel,
  scope: string,
  message: string,
  data?: unknown,
) => void;

export interface PostHogAPIConfig {
  apiUrl: string;
  getApiKey: () => string;
  projectId: number;
}

export interface AgentConfig {
  posthog?: PostHogAPIConfig;
  debug?: boolean;
  onLog?: OnLogCallback;
}

export interface WorktreeInfo {
  worktreePath: string;
  worktreeName: string;
  branchName: string;
  baseBranch: string;
  createdAt: string;
}

// Device info for tracking where work happens
export interface DeviceInfo {
  type: "local" | "cloud";
  name?: string;
}

// Agent execution mode - for tracking interactive vs background runs, when backgrounded an agent will continue working without asking questions
export type AgentMode = "interactive" | "background";

// Git file status codes
export type FileStatus = "A" | "M" | "D";

export interface FileChange {
  path: string;
  status: FileStatus;
}

// Tree snapshot - what TreeTracker captures
export interface TreeSnapshot {
  treeHash: string;
  baseCommit: string | null;
  archiveUrl?: string;
  changes: FileChange[];
  timestamp: string;
  interrupted?: boolean;
}

// Tree snapshot event - includes device info when sent as notification
export interface TreeSnapshotEvent extends TreeSnapshot {
  device?: DeviceInfo;
}
