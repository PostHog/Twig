// Main entry point - re-exports from src

// ACP connection utilities
export type {
  AcpConnectionConfig,
  InProcessAcpConnection,
} from "./src/adapters/claude/claude.js";
export { createAcpConnection } from "./src/adapters/claude/claude.js";

// Session persistence
export type { SessionPersistenceConfig } from "./src/session-store.js";
export { SessionStore } from "./src/session-store.js";

// Todo management
export type { TodoItem, TodoList } from "./src/todo-manager.js";
export { TodoManager } from "./src/todo-manager.js";

// Tool types
export { ToolRegistry } from "./src/tools/registry.js";
export type {
  BashOutputTool,
  BashTool,
  EditTool,
  ExitPlanModeTool,
  GlobTool,
  GrepTool,
  KillShellTool,
  KnownTool,
  NotebookEditTool,
  ReadTool,
  SlashCommandTool,
  TaskTool,
  TodoWriteTool,
  Tool,
  ToolCategory,
  WebFetchTool,
  WebSearchTool,
  WriteTool,
} from "./src/tools/types.js";

// Core types
export type {
  AgentConfig,
  ExecutionResult,
  LogLevel as LogLevelType,
  McpServerConfig,
  OnLogCallback,
  ResearchEvaluation,
  SessionNotification,
  StoredEntry,
  StoredNotification,
  StoredSessionNotification,
  SupportingFile,
  Task,
  TaskRun,
  WorktreeInfo,
} from "./src/types.js";
export { PermissionMode } from "./src/types.js";

// ACP extensions (PostHog-specific notification types)
export { POSTHOG_NOTIFICATIONS } from "./src/acp-extensions.js";
export type {
  ArtifactNotificationPayload,
  BranchCreatedPayload,
  ConsoleNotificationPayload,
  ErrorNotificationPayload,
  PhaseNotificationPayload,
  PostHogNotificationPayload,
  PostHogNotificationType,
  PrCreatedPayload,
  RunStartedPayload,
  SdkSessionPayload,
  TaskCompletePayload,
} from "./src/acp-extensions.js";

// Logging
export type { LoggerConfig } from "./src/utils/logger.js";
export { Logger, LogLevel } from "./src/utils/logger.js";

// Worktree management
export type { WorktreeConfig } from "./src/worktree-manager.js";
export { WorktreeManager } from "./src/worktree-manager.js";
