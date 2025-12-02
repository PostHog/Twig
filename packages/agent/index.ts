// Main entry point - re-exports from src

// TODO: Refactor - legacy adapter removed
// export { ClaudeAdapter } from "./src/adapters/claude-legacy/claude-adapter.js";
// export type { ProviderAdapter } from "./src/adapters/types.js";
// export { Agent } from "./src/agent.js";
export type { TodoItem, TodoList } from "./src/todo-manager.js";
// Todo management
export { TodoManager } from "./src/todo-manager.js";
export { ToolRegistry } from "./src/tools/registry.js";
// Tool types
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
export type {
  AgentConfig,
  AgentEvent,
  // Individual event types for creating events
  ArtifactEvent,
  CompactBoundaryEvent,
  ConsoleEvent,
  ContentBlockStartEvent,
  ContentBlockStopEvent,
  DoneEvent,
  ErrorEvent,
  ExecutionResult,
  InitEvent,
  LogLevel as LogLevelType,
  McpServerConfig,
  MessageDeltaEvent,
  MessageStartEvent,
  MessageStopEvent,
  MetricEvent,
  OnLogCallback,
  RawSDKEvent,
  ResearchEvaluation,
  StatusEvent,
  SupportingFile,
  Task,
  TaskRun,
  TokenEvent,
  ToolCallEvent,
  ToolResultEvent,
  UserMessageEvent,
  WorktreeInfo,
} from "./src/types.js";
export {
  AgentEventSchema,
  PermissionMode,
  parseAgentEvent,
  parseAgentEvents,
} from "./src/types.js";
export type { LoggerConfig } from "./src/utils/logger.js";
export {
  Logger,
  LogLevel,
} from "./src/utils/logger.js";
export type { WorktreeConfig } from "./src/worktree-manager.js";
// Worktree management
export { WorktreeManager } from "./src/worktree-manager.js";
