// import and export to keep a single type file
import type {
  CanUseTool,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
export type { CanUseTool, PermissionResult };

// PostHog Task model (matches Array's OpenAPI schema)
export interface Task {
  id: string;
  task_number?: number;
  slug?: string;
  title: string;
  description: string;
  origin_product: 'error_tracking' | 'eval_clusters' | 'user_created' | 'support_queue' | 'session_summaries';
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
export interface LogEntry {
  type: string; // e.g., "info", "warning", "error", "success", "debug"
  message: string;
  [key: string]: unknown; // Allow additional fields
}

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

export type TaskRunStatus = 'not_started' | 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export type TaskRunEnvironment = 'local' | 'cloud';

// TaskRun model - represents individual execution runs of tasks
export interface TaskRun {
  id: string;
  task: string; // Task ID
  team: number;
  branch: string | null;
  stage: string | null; // Current stage (e.g., 'research', 'plan', 'build')
  environment: TaskRunEnvironment;
  status: TaskRunStatus;
  log_url?: string; // Presigned S3 URL for log access (valid for 1 hour)
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
  createPR?: boolean; // Whether to create PR after build (defaults to false if local. This setting has no effect if isCloudMode is true.)
  autoProgress?: boolean;
  queryOverrides?: Record<string, any>;
  // Fine-grained permission control (only applied to build phase)
  // See: https://docs.claude.com/en/api/agent-sdk/permissions
  canUseTool?: CanUseTool;
}

// Base event with timestamp
interface BaseEvent {
  ts: number;
}

// Streaming content events
export interface TokenEvent extends BaseEvent {
  type: "token";
  content: string;
  contentType?: "text" | "thinking" | "tool_input";
}

export interface ContentBlockStartEvent extends BaseEvent {
  type: "content_block_start";
  index: number;
  contentType: "text" | "tool_use" | "thinking";
  toolName?: string;
  toolId?: string;
}

export interface ContentBlockStopEvent extends BaseEvent {
  type: "content_block_stop";
  index: number;
}

// Tool events
export interface ToolCallEvent extends BaseEvent {
  type: "tool_call";
  toolName: string;
  callId: string;
  args: Record<string, any>;
  parentToolUseId?: string | null; // For nested tool calls (subagents)
  // Tool metadata (enriched by adapter for UI consumption)
  tool?: import("./tools/types.js").Tool;
  category?: import("./tools/types.js").ToolCategory;
}

export interface ToolResultEvent extends BaseEvent {
  type: "tool_result";
  toolName: string;
  callId: string;
  result: any;
  isError?: boolean; // Whether the tool execution failed
  parentToolUseId?: string | null; // For nested tool calls (subagents)
  // Tool metadata (enriched by adapter for UI consumption)
  tool?: import("./tools/types.js").Tool;
  category?: import("./tools/types.js").ToolCategory;
}

// Message lifecycle events
export interface MessageStartEvent extends BaseEvent {
  type: "message_start";
  messageId?: string;
  model?: string;
}

export interface MessageDeltaEvent extends BaseEvent {
  type: "message_delta";
  stopReason?: string;
  stopSequence?: string;
  usage?: {
    outputTokens: number;
  };
}

export interface MessageStopEvent extends BaseEvent {
  type: "message_stop";
}

// User message events
export interface UserMessageEvent extends BaseEvent {
  type: "user_message";
  content: string;
  isSynthetic?: boolean;
}

// System events
export interface StatusEvent extends BaseEvent {
  type: "status";
  phase: string;
  // Common optional fields (varies by phase):
  kind?: string; // Kind of status (plan, implementation)
  branch?: string; // Git branch name
  prUrl?: string; // Pull request URL
  taskId?: string; // Task identifier
  messageId?: string; // Claude message ID
  model?: string; // Model name
  [key: string]: any; // Allow additional fields
}

export interface InitEvent extends BaseEvent {
  type: "init";
  model: string;
  tools: string[];
  permissionMode: string;
  cwd: string;
  apiKeySource: string;
  agents?: string[];
  slashCommands?: string[];
  outputStyle?: string;
  mcpServers?: Array<{ name: string; status: string }>;
}

export interface CompactBoundaryEvent extends BaseEvent {
  type: "compact_boundary";
  trigger: "manual" | "auto";
  preTokens: number;
}

// Result events
export interface DoneEvent extends BaseEvent {
  type: "done";
  result?: string; // Final summary text from Claude
  durationMs?: number;
  durationApiMs?: number; // API-only duration (excluding local processing)
  numTurns?: number;
  totalCostUsd?: number;
  usage?: any;
  modelUsage?: {
    // Per-model usage breakdown
    [modelName: string]: {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
      webSearchRequests: number;
      costUSD: number;
      contextWindow: number;
    };
  };
  permissionDenials?: Array<{
    // Tools that were denied by permissions
    tool_name: string;
    tool_use_id: string;
    tool_input: Record<string, unknown>;
  }>;
}

export interface ErrorEvent extends BaseEvent {
  type: "error";
  message: string;
  error?: any;
  errorType?: string;
  context?: Record<string, any>; // Partial error context for debugging
  sdkError?: any; // Original SDK error object
}

// Metric and artifact events (general purpose, not tool-specific)
export interface MetricEvent extends BaseEvent {
  type: "metric";
  key: string;
  value: number;
  unit?: string;
}

export interface ArtifactEvent extends BaseEvent {
  type: "artifact";
  kind: string;
  content: any;
}

export interface RawSDKEvent extends BaseEvent {
  type: "raw_sdk_event";
  sdkMessage: any; // Full SDK message for debugging
}

export type AgentEvent =
  | TokenEvent
  | ContentBlockStartEvent
  | ContentBlockStopEvent
  | ToolCallEvent
  | ToolResultEvent
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | UserMessageEvent
  | StatusEvent
  | InitEvent
  | CompactBoundaryEvent
  | DoneEvent
  | ErrorEvent
  | MetricEvent
  | ArtifactEvent
  | RawSDKEvent;

export interface ExecutionResult {
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
      instance?: any; // McpServer instance
    };

export interface AgentConfig {
  workingDirectory?: string;
  onEvent?: (event: AgentEvent) => void;

  // PostHog API configuration
  posthogApiUrl: string;
  posthogApiKey: string;
  posthogProjectId: number;

  // PostHog MCP configuration
  posthogMcpUrl?: string;

  // MCP Server configuration
  // Additional MCP servers (PostHog MCP is always included by default)
  // You can override the PostHog MCP config by providing mcpServers.posthog
  mcpServers?: Record<string, McpServerConfig>;

  // Logging configuration
  debug?: boolean;

  // Fine-grained permission control for direct run() calls
  // See: https://docs.claude.com/en/api/agent-sdk/permissions
  canUseTool?: CanUseTool;
}

export interface PostHogAPIConfig {
  apiUrl: string;
  apiKey: string;
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
  metadata?: Record<string, any>;
}

export interface UrlMention {
  url: string;
  type: ResourceType;
  id?: string;
  label?: string;
}

// Research evaluation types
export interface ResearchQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface ResearchAnswer {
  questionId: string;
  selectedOption: string;
  customInput?: string;
}

export interface ResearchEvaluation {
  actionabilityScore: number; // 0-1 confidence score
  context: string; // brief summary for planning
  keyFiles: string[]; // files needing modification
  blockers?: string[]; // what's preventing full confidence
  questions?: ResearchQuestion[]; // only if score < 0.7
  answered?: boolean; // whether questions have been answered
  answers?: ResearchAnswer[]; // user's answers to questions
}
